/** Retain the official shell and all its plugin seats; scope presentation overrides to workbench mode. */
function inboxInstallShell(ctx) {
  ctx.effect(() => {
    // Native fallback sheets share the plugin ID; replace only the compact shell's own sheet.
    const selector = 'style[data-inbox-shell="dsh-session-inbox"]';
    document.querySelectorAll(selector).forEach(style => style.remove());
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-session-inbox';
    style.dataset.inboxShell = 'dsh-session-inbox';
    style.textContent = INBOX_CSS;
    document.head.appendChild(style);
    const render = () => { document.documentElement.dataset.inboxMode = inboxReadModeSnapshot(); };
    render();
    const unsubscribe = inboxSubscribeMode(render);
    return () => {
      unsubscribe();
      // A previous module can dispose after its replacement has already taken ownership.
      if ([...document.querySelectorAll(selector)].includes(style)) delete document.documentElement.dataset.inboxMode;
      style.remove();
    };
  }, 'session-inbox: compact native shell');
}
