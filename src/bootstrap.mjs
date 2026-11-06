window.__ModuleLoader__.load({ id: 'dsh-session-inbox', factory: () => ({
  apply(ctx) {
    const bridge = window.__DSH_SESSION_INBOX_BRIDGE__;
    const host = window.__DSH_SESSION_INBOX_HOST__;
    ctx.effect(() => {
      const release = bridge?.activate();
      let notice;
      let timer;
      const report = () => {
        if (!(bridge?.reason || host?.mode === 'native') || notice) return;
        notice = document.createElement('aside');
        notice.dataset.inboxFallback = '';
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'position:fixed;left:16px;bottom:20px;z-index:10000;max-width:280px;padding:10px 14px;border-radius:10px;background:#f5f3ee;color:#48443e;box-shadow:0 3px 16px #0002;font:13px/1.5 system-ui';
        notice.textContent = '会话工作台暂用 DSH 原生列表';
        document.body.appendChild(notice);
        timer = setTimeout(() => notice?.remove(), 8000);
      };
      const unsubscribe = bridge?.subscribe(report);
      report();
      return () => { unsubscribe?.(); release?.(); clearTimeout(timer); notice?.remove(); };
    }, 'session-inbox: adaptive lifecycle');
  },
}) });
