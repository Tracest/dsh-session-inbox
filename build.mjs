/** Version-pinned native adapters retain navigation, panel slots and a complete original-layout fallback. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw new Error(`Unsupported DSH client: ambiguous or missing hook ${marker}`);
  return source.replace(marker, replacement);
}
function factoryBody(source) {
  const start = source.indexOf('factory: (require) => {');
  const end = source.lastIndexOf('\n\t}\n});');
  if (start < 0 || end < start) throw new Error('Unsupported DSH module wrapper.');
  return source.slice(start + 'factory: (require) => {'.length, end).replace(/\/\/# sourceMappingURL=.*$/gm, '');
}

const originals = {
  workspace: read('./vendor/workspace-client-0.2.1-rc.5.js'),
  sidebar: read('./vendor/sidebar-client-0.2.1-rc.5.js'),
};
let workspace = factoryBody(originals.workspace).replaceAll('@deepseek-ai/dsh-client-ui-workspace', 'dsh-session-inbox');
workspace = replaceOnce(workspace, '}, WorkspaceBrowser));', '}, createInboxBrowser(WorkspaceBrowser, ctx)));');
workspace = replaceOnce(workspace, 'const workspaces = ctx.get("workspaces");', `const workspaces = ctx.get("workspaces");
      inboxInstallShell(ctx);
      // Pull a fresh baseline when hot-replacing a UI module.
      queueMicrotask(() => sessions.refresh().catch(error => console.warn('[dsh-session-inbox] Catalog refresh failed', error)));`);
workspace = replaceOnce(workspace, '\t\texports.apply = apply;', `${read('./src/client.mjs')}\n\t\texports.apply = apply;`);

const rootClass = originals.sidebar.match(/"root": "([^"]+)"/)[1];
const collapsedClass = originals.sidebar.match(/"collapsed": "([^"]+)"/)[1];
const shellScope = `html[data-inbox-mode="inbox"] .${rootClass}:not(.${collapsedClass})`;
let css = read('./src/style.css')
  .replaceAll('.dsi-shell-compact .dsi-shell-root', shellScope)
  .replaceAll('.dsi-shell-compact ', `${shellScope} `);
// Resolve presentation selectors from the pinned class map. No official shell module or callback is replaced.
for (const key of ['root', 'topStrip', 'logoRow', 'brandIdentity', 'brandMark', 'brandName', 'newSession',
  'newSessionContent', 'newSessionLabel', 'newSessionLabelMask', 'newSessionShortcut', 'panelList', 'panelRow', 'panelGlyph',
  'panelTitle', 'moreAnchor', 'regionArea', 'footArea']) {
  const match = originals.sidebar.match(new RegExp(`"${key}": "([^"]+)"`));
  if (!match) throw new Error(`Missing sidebar class: ${key}`);
  const alias = key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
  css = css.replace(new RegExp(`\\.dsi-shell-${alias}(?![-a-z])`, 'g'), `.${match[1]}`);
}

const compiled = `window.__ModuleLoader__.load({id:'dsh-session-inbox',factory:(require)=>{
${read('./src/model.mjs').replace(/^export /gm, '')}
${read('./src/shared.mjs')}
${read('./src/shell.mjs')}
const workspaceModule=(()=>{${workspace}})();
const inboxStyle=document.createElement('style');inboxStyle.dataset.plugin='dsh-session-inbox';inboxStyle.textContent=${JSON.stringify(css)};document.head.appendChild(inboxStyle);
return workspaceModule;
}});\n`;
new vm.Script(compiled);
fs.mkdirSync(new URL('./lib', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./lib/client.js', import.meta.url), compiled);
fs.writeFileSync(new URL('./lib/index.js', import.meta.url), '// Browser-only UI replacement.\nexport function apply() {}\n');
fs.writeFileSync(new URL('./lib/build-info.json', import.meta.url), JSON.stringify({
  version: '0.3.0', dshVersion: '0.2.1-rc.5',
  upstreamSha256: Object.fromEntries(Object.entries(originals).map(([key, source]) => [key, crypto.createHash('sha256').update(source).digest('hex')])),
}, null, 2) + '\n');
console.log('Built DSH session workbench 0.3.0 with native workspace navigation and scoped sidebar styles.');
