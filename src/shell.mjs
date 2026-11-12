/** Resolve the official shell's current CSS-module hashes, rather than the vendored build's hashes. */
function inboxResolveShellCss(template) {
  const owner = '@deepseek-ai/dsh-client-ui-sidebar';
  const sheets = [...document.querySelectorAll(`style[data-plugin-css="${owner}/SidebarRoot.module.css"]`)]
    .filter(style => style.dataset.plugin === owner);
  if (sheets.length !== 1) throw new Error('Session workbench requires one loaded native SidebarRoot stylesheet.');
  const classes = {};
  // These wrappers were introduced after the first supported sidebar. Their
  // optional styling must not prevent older native layouts from mounting.
  const optional = new Set(['newSessionContent', 'newSessionLabelMask', 'newSessionShortcut', 'moreAnchor',
    'scrollArea', 'scrollRegion']);
  for (const key of ['root', 'collapsed', 'topStrip', 'logoRow', 'brandIdentity', 'brandMark', 'brandName', 'newSession',
    'newSessionContent', 'newSessionLabel', 'newSessionLabelMask', 'newSessionShortcut', 'panelList', 'panelRow',
    'panelGlyph', 'panelTitle', 'moreAnchor', 'regionArea', 'scrollArea', 'scrollRegion', 'footArea']) {
    const matches = [...new Set([...sheets[0].textContent.matchAll(new RegExp(`\\.([_a-zA-Z][-\\w]*_${key})(?![-\\w])`, 'g'))]
      .map(match => match[1]))];
    if (matches.length > 1 || (matches.length === 0 && !optional.has(key))) {
      throw new Error(`Unsupported native sidebar stylesheet: missing or ambiguous ${key} class.`);
    }
    classes[key] = matches[0] ?? `dsi-absent-${key}`;
  }
  // The full compact grid re-lays the shell out as brand / nav / region / foot, so it needs the
  // region as one of the root's direct children. Only the oldest laid-out shell does that; newer
  // ones park the region and the panel list inside their own scroll area, where the grid would
  // collapse the scroll row to zero height and hide the whole sidebar.
  const base = `html[data-inbox-mode="inbox"] .${classes.root}:not(.${classes.collapsed})`;
  const scope = `${base}:has(> .${classes.regionArea})`;
  // Those newer shells keep their layout; only the panel seats are tightened into one row.
  const nested = `${base}:is(:has(> .${classes.scrollRegion}), :has(> .${classes.scrollArea}))`;
  // The region has to own the leftover height in both modes, otherwise the workbench (and the
  // native list it falls back to) only ever gets its content height and the shelves float.
  const layout = `.${classes.root}:is(:has(> .${classes.scrollRegion}), :has(> .${classes.scrollArea}))`;
  let css = template.replaceAll('.dsi-shell-nested', nested)
    .replaceAll('.dsi-shell-fill', layout)
    // Presentation applies to whichever shell is loaded; only the grid needs the region as a
    // direct child, so it keeps the narrower scope.
    .replaceAll('.dsi-shell-compact .dsi-shell-root', scope)
    .replaceAll('.dsi-shell-compact ', `${base} `);
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
    const bridge = window.__DSH_SESSION_INBOX_BRIDGE__;
    const render = () => {
      const enabled = bridge?.enabled !== false;
      if (enabled && ![...document.querySelectorAll(selector)].includes(style)) document.head.appendChild(style);
      document.documentElement.dataset.inboxMode = enabled ? inboxReadModeSnapshot() : 'original';
    };
    render();
    const unsubscribe = inboxSubscribeMode(render);
    const unsubscribeBridge = bridge?.subscribe(render);
    return () => {
      unsubscribe();
      unsubscribeBridge?.();
      // A previous module can dispose after its replacement has already taken ownership.
      if ([...document.querySelectorAll(selector)].includes(style)) delete document.documentElement.dataset.inboxMode;
      style.remove();
    };
  }, 'session-inbox: compact native shell');
}
