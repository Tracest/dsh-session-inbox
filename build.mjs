/** Select a tested native adapter while retaining its navigation and complete fallback. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Git may check these inputs out as CRLF; generated bundles stay byte-stable.
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const { version, engines: { dsh: engineRange } } = JSON.parse(read('./package.json'));
const { dshVersions } = JSON.parse(read('./compatibility.json'));
if (engineRange !== dshVersions.join(' || ')) throw new Error('DSH engine range must match the tested adapter list.');
if (new Set(dshVersions).size !== dshVersions.length) throw new Error('Duplicate DSH adapter version.');

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

const upstreamSha256 = {};
const searchClasses = {};
const adapters = dshVersions.map(dshVersion => {
  const originals = Object.fromEntries(['workspace', 'sidebar'].map(kind => [kind, read(`./vendor/${kind}-client-${dshVersion}.js`)]));
  let workspace = factoryBody(originals.workspace).replaceAll('@deepseek-ai/dsh-client-ui-workspace', 'dsh-session-inbox');
  workspace = replaceOnce(workspace, '}, WorkspaceBrowser));', '}, createInboxBrowser(WorkspaceBrowser, ctx)));');
  workspace = replaceOnce(workspace, 'const workspaces = ctx.get("workspaces");', `const workspaces = ctx.get("workspaces");
      inboxInstallShell(ctx);
      queueMicrotask(() => sessions.refresh().catch(error => console.warn('[dsh-session-inbox] Catalog refresh failed', error)));`);
  const titleFallback = workspace.includes('function workspaceDisplayTitle(') ? ''
    : 'function workspaceDisplayTitle(title, fallback) { return typeof title === "string" && title.trim() ? title : fallback; }\n';
  workspace = replaceOnce(workspace, '\t\texports.apply = apply;', `${titleFallback}${read('./src/client.mjs')}\n\t\texports.apply = apply;`);
  const expanded = originals.workspace.match(/"searchExpanded": "([^"]+)"/);
  if (!expanded) throw new Error(`Missing native search expansion class in ${dshVersion}.`);
  searchClasses[dshVersion] = expanded[1];
  upstreamSha256[dshVersion] = Object.fromEntries(Object.entries(originals).map(([key, source]) => [key, crypto.createHash('sha256').update(source).digest('hex')]));
  const hasLeadingSlot = originals.workspace.includes('"sidebar.session.row.leading"');
  return `${JSON.stringify(dshVersion)}:()=>{const INBOX_HAS_LEADING_SLOT=${hasLeadingSlot};${workspace}}`;
});

const compiled = `window.__ModuleLoader__.load({id:'dsh-session-inbox',factory:(require)=>{
const INBOX_PLUGIN_VERSION=${JSON.stringify(version)};
const INBOX_HOST_RELEASE=window.__DSH_SESSION_INBOX_HOST__?.version ?? window.__DSH_BOOT__?.release?.version;
const INBOX_DSH_VERSION=typeof INBOX_HOST_RELEASE==='string' ? INBOX_HOST_RELEASE.split('+')[0] : undefined;
const INBOX_SEARCH_CLASSES=${JSON.stringify(searchClasses)};
if (!Object.hasOwn(INBOX_SEARCH_CLASSES, INBOX_DSH_VERSION)) throw new Error('Unsupported DSH version for session workbench: '+String(INBOX_DSH_VERSION));
const INBOX_CSS=${JSON.stringify(read('./src/style.css'))}.replaceAll('.dsi-native-search-expanded','.'+INBOX_SEARCH_CLASSES[INBOX_DSH_VERSION]);
${read('./src/model.mjs').replace(/^export /gm, '')}
${read('./src/backup.mjs').replace(/^import .*?;\n/gm, '').replace(/^export /gm, '')}
${read('./src/shared.mjs')}
${read('./src/shell.mjs')}
const adapters={${adapters.join(',\n')}};
return adapters[INBOX_DSH_VERSION]();
}});\n`;
new vm.Script(compiled);
fs.mkdirSync(new URL('./lib', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./lib/client.js', import.meta.url), compiled);
fs.writeFileSync(new URL('./lib/index.js', import.meta.url), read('./src/host.mjs'));
fs.writeFileSync(new URL('./lib/build-info.json', import.meta.url), JSON.stringify({ version, dshVersions, upstreamSha256 }, null, 2) + '\n');
console.log(`Built session workbench ${version} with ${dshVersions.length} version-specific native adapters.`);
