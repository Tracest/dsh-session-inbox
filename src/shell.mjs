/** Resolve the official shell's current CSS-module hashes, rather than the vendored build's hashes. */
function inboxResolveShellCss(template) {
  const owner = '@deepseek-ai/dsh-client-ui-sidebar';
  const sheets = [...document.querySelectorAll(`style[data-plugin-css="${owner}/SidebarRoot.module.css"]`)]
    .filter(style => style.dataset.plugin === owner);
  if (sheets.length !== 1) throw new Error('Session workbench requires one loaded native SidebarRoot stylesheet.');
  const classes = {};
  // These wrappers were introduced after the first supported sidebar. Their
  // optional styling must not prevent older native layouts from mounting.
  const optional = new Set(['newSessionContent', 'newSessionLabelMask', 'newSessionShortcut', 'moreAnchor']);
  for (const key of ['root', 'collapsed', 'topStrip', 'logoRow', 'brandIdentity', 'brandMark', 'brandName', 'newSession',
    'newSessionContent', 'newSessionLabel', 'newSessionLabelMask', 'newSessionShortcut', 'panelList', 'panelRow',
    'panelGlyph', 'panelTitle', 'moreAnchor', 'regionArea', 'footArea']) {
    const matches = [...new Set([...sheets[0].textContent.matchAll(new RegExp(`\\.([_a-zA-Z][-\\w]*_${key})(?![-\\w])`, 'g'))]
      .map(match => match[1]))];
    if (matches.length > 1 || (matches.length === 0 && !optional.has(key))) {
      throw new Error(`Unsupported native sidebar stylesheet: missing or ambiguous ${key} class.`);
    }
    classes[key] = matches[0] ?? `dsi-absent-${key}`;
  }
  const scope = `html[data-inbox-mode="inbox"] .${classes.root}:not(.${classes.collapsed})`;
  let css = template.replaceAll('.dsi-shell-compact .dsi-shell-root', scope)
    .replaceAll('.dsi-shell-compact ', `${scope} `);
  for (const [key, className] of Object.entries(classes)) {
    const alias = key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    css = css.replace(new RegExp(`\\.dsi-shell-${alias}(?![-a-z])`, 'g'), `.${className}`);
  }
  return css;
}

/** Retain the official shell and all its plugin seats; scope presentation overrides to workbench mode. */
function inboxInstallShell(ctx) {
  ctx.effect(() => {
    const css = inboxResolveShellCss(INBOX_CSS);
    // Native fallback sheets share the plugin ID; replace only the compact shell's own sheet.
    const selector = 'style[data-inbox-shell="dsh-session-inbox"]';
    document.querySelectorAll(selector).forEach(style => style.remove());
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-session-inbox';
    style.dataset.inboxShell = 'dsh-session-inbox';
    style.textContent = css;
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
