/** Retain the official shell and all its plugin seats; scope presentation overrides to workbench mode. */
function inboxInstallShell(ctx) {
  ctx.effect(() => {
    const render = () => { document.documentElement.dataset.inboxMode = inboxReadModeSnapshot(); };
    render();
    const unsubscribe = inboxSubscribeMode(render);
    return () => {
      unsubscribe();
      delete document.documentElement.dataset.inboxMode;
    };
  }, 'session-inbox: compact native shell');
}
