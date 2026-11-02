/** Version-pinned native adapters retain navigation, panel slots and a complete original-layout fallback. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Git may check these text inputs out as CRLF on Windows; the generated bundle stays byte-stable.
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const version = JSON.parse(read('./package.json')).version;
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

// The official shell stays installed. Its CSS-module hashes differ between Desktop builds,
// so the browser resolves these aliases from that shell's own loaded stylesheet.
let css = read('./src/style.css');
const nativeSearchExpanded = originals.workspace.match(/"searchExpanded": "([^"]+)"/);
if (!nativeSearchExpanded) throw new Error('Missing native search expansion class.');
css = css.replaceAll('.dsi-native-search-expanded', `.${nativeSearchExpanded[1]}`);

const compiled = `window.__ModuleLoader__.load({id:'dsh-session-inbox',factory:(require)=>{
const INBOX_PLUGIN_VERSION=${JSON.stringify(version)};
const INBOX_CSS=${JSON.stringify(css)};
${read('./src/model.mjs').replace(/^export /gm, '')}
${read('./src/backup.mjs').replace(/^import .*?;\n/gm, '').replace(/^export /gm, '')}
${read('./src/shared.mjs')}
${read('./src/shell.mjs')}
const workspaceModule=(()=>{${workspace}})();
return workspaceModule;
}});\n`;
new vm.Script(compiled);
fs.mkdirSync(new URL('./lib', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./lib/client.js', import.meta.url), compiled);
fs.writeFileSync(new URL('./lib/index.js', import.meta.url), '// Browser-only UI replacement.\nexport function apply() {}\n');
fs.writeFileSync(new URL('./lib/build-info.json', import.meta.url), JSON.stringify({
  version, dshVersion: '0.2.1-rc.5',
  upstreamSha256: Object.fromEntries(Object.entries(originals).map(([key, source]) => [key, crypto.createHash('sha256').update(source).digest('hex')])),
}, null, 2) + '\n');
console.log(`Built DSH session workbench ${version} with native workspace navigation and scoped sidebar styles.`);
