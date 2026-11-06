/** Ship one adapter template; vendored releases are regression fixtures only. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { compileAdapter } from './src/adapter.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('./package.json'));
const compatibility = JSON.parse(read('./compatibility.json'));
if (manifest.engines.dsh !== compatibility.engineRange) throw new Error('Compatibility policy and package engine range differ.');
const template = {
  version: manifest.version,
  client: read('./src/client.mjs'),
  css: read('./src/style.css'),
  bridge: read('./src/bridge.mjs'),
  shared: [
    read('./src/model.mjs').replace(/^export /gm, ''),
    read('./src/backup.mjs').replace(/^import .*?;\n/gm, '').replace(/^export /gm, ''),
    read('./src/shared.mjs'), read('./src/shell.mjs'),
  ].join('\n'),
};
const upstreamSha256 = {};
for (const version of compatibility.dshVersions) {
  const originals = Object.fromEntries(['workspace', 'sidebar'].map(kind => [kind, read(`./vendor/${kind}-client-${version}.js`)]));
  const compiled = compileAdapter(originals.workspace, template, { version });
  if (compiled.mode !== 'adaptive') throw new Error(`${version}: ${compiled.reason}`);
  upstreamSha256[version] = Object.fromEntries(Object.entries(originals).map(([kind, source]) =>
    [kind, crypto.createHash('sha256').update(source).digest('hex')]));
}
const client = read('./src/bootstrap.mjs');
new vm.Script(client);
fs.mkdirSync(new URL('./lib', import.meta.url), { recursive: true });
for (const [name, source] of [['client.js', client], ['index.js', read('./src/host.mjs')], ['adapter.mjs', read('./src/adapter.mjs')]]) {
  fs.writeFileSync(new URL('./lib/' + name, import.meta.url), source);
}
fs.writeFileSync(new URL('./lib/runtime-template.json', import.meta.url), JSON.stringify(template) + '\n');
fs.writeFileSync(new URL('./lib/build-info.json', import.meta.url), JSON.stringify({
  version: manifest.version, strategy: 'current-native-factory', engineRange: compatibility.engineRange,
  regressionVersions: compatibility.dshVersions, upstreamSha256,
}, null, 2) + '\n');
console.log(`Built ${manifest.version}: one adaptive template, ${compatibility.dshVersions.length} native regression fixtures.`);
