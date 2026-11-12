window.__ModuleLoader__.load({ id: 'dsh-session-inbox', factory: () => ({
  apply(ctx) {
    const bridge = window.__DSH_SESSION_INBOX_BRIDGE__;
    const host = window.__DSH_SESSION_INBOX_HOST__;
    ctx.effect(() => {
      const release = bridge?.activate();
      let notice;
      const report = () => {
        // Name the exact reason the workbench could not mount. A silent native
        // list is indistinguishable from a plugin that never loaded at all.
        const reason = !bridge ? 'no-bridge'
          : bridge.reason ? bridge.reason
            : host?.mode === 'native' ? (host.reason || 'native') : '';
        if (!reason || notice) return;
        notice = document.createElement('aside');
        notice.dataset.inboxFallback = '';
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'position:fixed;left:16px;bottom:20px;z-index:10000;max-width:320px;padding:10px 14px;border-radius:10px;background:#f5f3ee;color:#48443e;box-shadow:0 3px 16px #0002;font:13px/1.5 system-ui';
        notice.textContent = `会话工作台暂用原生列表 · ${reason}`;
        // The reason stays available until the reader dismisses it, then never returns.
        notice.title = '点击关闭这条提示';
        notice.style.cursor = 'pointer';
        notice.addEventListener('click', () => notice.remove());
        document.body.appendChild(notice);
      };
      const unsubscribe = bridge?.subscribe(report);
      report();
      return () => { unsubscribe?.(); release?.(); notice?.remove(); };
    }, 'session-inbox: adaptive lifecycle');
  },
}) });
