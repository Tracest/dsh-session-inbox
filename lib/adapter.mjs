import vm from 'node:vm';

export const WORKSPACE_MODULE = '@deepseek-ai/dsh-client-ui-workspace';
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw new Error('native-hook-changed');
  return source.replace(marker, replacement);
}

/** Build an in-memory enhancement of the current Host; never write its files. */
export function compileAdapter(source, template, details = {}) {
  try {
    const normalized = source.replace(/\r\n/g, '\n');
    if (!normalized.includes(`id: "${WORKSPACE_MODULE}"`)) throw new Error('native-owner-changed');
    const start = normalized.indexOf('factory: (require) => {');
    const end = normalized.lastIndexOf('\n\t}\n});');
    if (start < 0 || end < start) throw new Error('native-module-format-changed');
    const body = normalized.slice(start + 'factory: (require) => {'.length, end);
    const expected = `(require) => {${body}\n\t}`;
    const expanded = body.match(/"searchExpanded": "([^"]+)"/);
    if (!expanded || !body.includes('function SessionHoverContent(')) throw new Error('native-view-contract-changed');
    let adapted = replaceOnce(body, '}, WorkspaceBrowser));', '}, createInboxBrowser(WorkspaceBrowser, ctx)));');
    adapted = replaceOnce(adapted, 'const workspaces = ctx.get("workspaces");',
      `const workspaces = ctx.get("workspaces");
      try {
        inboxInstallShell(ctx);
        queueMicrotask(() => Promise.resolve().then(() => sessions.refresh()).catch(error => {
          window.__DSH_SESSION_INBOX_BRIDGE__.fail('catalog-unavailable');
          console.warn('[dsh-session-inbox] Catalog refresh failed', error);
        }));
      } catch (error) {
        window.__DSH_SESSION_INBOX_BRIDGE__.fail('sidebar-contract-changed');
      }`);
    const titleFallback = body.includes('function workspaceDisplayTitle(') ? ''
      : 'function workspaceDisplayTitle(title, fallback) { return typeof title === "string" && title.trim() ? title : fallback; }\n';
    adapted = replaceOnce(adapted, '\t\texports.apply = apply;', `${titleFallback}${template.client}\n\t\texports.apply = apply;`);
    const css = template.css.replaceAll('.dsi-native-search-expanded', '.' + expanded[1]);
    const declarations = `const INBOX_PLUGIN_VERSION=${json(template.version)};
const INBOX_HAS_LEADING_SLOT=${body.includes('"sidebar.session.row.leading"')};
const INBOX_CSS=${json(css)};
${template.shared}`;
    const script = `${template.bridge}\ninboxInstallBridge(${json(WORKSPACE_MODULE)},${json(expected)},(require)=>{${declarations}\n${adapted}},${json(details)});\n`;
    // External JS may contain HTML parser state switches, including in tagged
    // templates. Rewriting those could change values; retain native UI instead.
    if (/<\/?script|<!--/i.test(script)) throw new Error('native-inline-format-unsupported');
    new vm.Script(script);
    return { mode: 'adaptive', script };
  } catch (error) {
    return { mode: 'native', reason: error.message };
  }
}
