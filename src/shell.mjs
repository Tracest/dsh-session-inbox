/** Retain the official shell and all its plugin seats; scope presentation overrides to workbench mode. */
function inboxInstallShell(ctx) {
  ctx.effect(() => {
    // Dispose presentation with this UI module; avoid stale rules after development reloads.
    document.querySelectorAll('style[data-plugin="dsh-session-inbox"]').forEach(style => style.remove());
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-session-inbox';
    style.textContent = INBOX_CSS;
    document.head.appendChild(style);
    const render = () => { document.documentElement.dataset.inboxMode = inboxReadModeSnapshot(); };
    render();
    const unsubscribe = inboxSubscribeMode(render);
    return () => {
      unsubscribe();
      style.remove();
      delete document.documentElement.dataset.inboxMode;
    };
  }, 'session-inbox: compact native shell');
}
