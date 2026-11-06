import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { compileAdapter, WORKSPACE_MODULE } from '../src/adapter.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const template = JSON.parse(read('../lib/runtime-template.json'));
const versions = JSON.parse(read('../compatibility.json')).dshVersions;
const latest = read('../vendor/workspace-client-0.2.2-rc.1.js');

for (const version of versions) test(`${version}: current native factory and all native styles are preserved`, () => {
  const upstream = read(`../vendor/workspace-client-${version}.js`);
  const compiled = compileAdapter(upstream, template, { version: '0.8.42-rc.9+future-fixture' });
  assert.equal(compiled.mode, 'adaptive');
  const styles = [];
  let registration;
  const sandbox = vm.createContext({
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
    console,
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }),
      head: { appendChild(style) { styles.push(style); } } },
  });
  vm.runInContext(compiled.script, sandbox);
  vm.runInContext(upstream, sandbox);
  assert.equal(registration.id, WORKSPACE_MODULE);
  assert.equal(sandbox.window.__DSH_SESSION_INBOX_BRIDGE__.reason, undefined);
  const exports = registration.factory(name => {
    if (name === 'react') return { Component: class {} };
    if (name === '@deepseek-ai/cordis') return { Service: class {} };
    return {};
  });
  assert.equal(typeof exports.apply, 'function');
  assert.equal(exports.inject.includes('contextMenus'), upstream.includes('"contextMenus"'));
  const expected = [...upstream.matchAll(/^\s*const css(?:\$\d+)? = ("(?:\\.|[^"\\])*");$/gm)].map(match => JSON.parse(match[1]));
  const ids = [...upstream.matchAll(/^\s*const tagId(?:\$\d+)? = ("(?:\\.|[^"\\])*");$/gm)].map(match => JSON.parse(match[1]));
  assert.deepEqual(styles.map(style => style.textContent), expected);
  assert.deepEqual(styles.map(style => style.dataset.pluginCss), ids);
});

test('changed or ambiguous view hooks keep the native module unmodified', () => {
  for (const source of [
    latest.replace('}, WorkspaceBrowser));', '}, ReplacementBrowser));'),
    latest.replace('const workspaces = ctx.get("workspaces");', 'const workspaces = ctx.workspaces;'),
    latest.replace('exports.apply = apply;', '// }, WorkspaceBrowser));\nexports.apply = apply;'),
    latest.replace('function SessionHoverContent(', 'function DifferentHover('),
  ]) {
    const result = compileAdapter(source, template);
    assert.equal(result.mode, 'native');
    assert.equal(result.script, undefined);
  }
});

test('inline metadata is serialized without HTML parser state changes', () => {
  const source = latest;
  const value = '</script><!--<script>bad()</script>';
  const result = compileAdapter(source, template, { version: value });
  assert.equal(result.mode, 'adaptive');
  assert.ok(!/<\/script/i.test(result.script));
  new vm.Script(result.script);
  let registration;
  const sandbox = vm.createContext({ window: { __ModuleLoader__: { load(value) { registration = value; } } }, console,
    document: { querySelector: () => ({}), createElement: () => ({ dataset: {} }), head: { appendChild() {} } } });
  vm.runInContext(result.script, sandbox);
  vm.runInContext(source, sandbox);
  assert.equal(sandbox.window.__DSH_SESSION_INBOX_BRIDGE__.details.version, value);
});

test('raw native HTML parser hazards retain native UI without rewriting string values', () => {
  for (const value of ['"</script>"', '"<!--<script>"', 'String.raw`</script>`']) {
    const source = latest.replace('exports.apply = apply;', `exports.sentinel = ${value};\n\t\texports.apply = apply;`);
    const result = compileAdapter(source, template);
    assert.equal(result.mode, 'native');
    assert.equal(result.reason, 'native-inline-format-unsupported');
    assert.equal(result.script, undefined);
  }
});

function bridgeFixture({ pending = false, broken = false } = {}) {
  const received = [];
  const original = () => 'native';
  const adapted = () => { if (broken) throw Error('missing optional interface'); return 'enhanced'; };
  const native = { id: WORKSPACE_MODULE, factory: original };
  const loader = { pendingQueue: pending ? [native] : [], load(value) { received.push(value); } };
  const initialLoad = loader.load;
  const sandbox = vm.createContext({ window: { __ModuleLoader__: loader }, console: { warn() {} } });
  vm.runInContext(read('../src/bridge.mjs'), sandbox);
  sandbox.inboxInstallBridge(WORKSPACE_MODULE, original.toString(), adapted, {});
  return { received, original, adapted, native, loader, initialLoad, bridge: sandbox.window.__DSH_SESSION_INBOX_BRIDGE__ };
}

test('bridge retains other modules and restores its own hook on disposal', () => {
  const f = bridgeFixture();
  const dispose = f.bridge.activate();
  assert.equal(f.bridge.enabled, true);
  const other = { id: 'another-plugin', factory: () => 'other' };
  f.loader.load(other); f.loader.load(f.native);
  assert.equal(f.received[0], other);
  assert.equal(f.received[1].factory(), 'enhanced');
  dispose(); dispose();
  assert.equal(f.bridge.enabled, false);
  assert.equal(f.loader.load, f.initialLoad);
});

test('bridge covers parser-preloaded native modules and contains factory failures', () => {
  const f = bridgeFixture({ pending: true, broken: true });
  f.bridge.activate();
  assert.equal(f.loader.pendingQueue[0].factory(), 'native');
  assert.equal(f.bridge.enabled, false);
  assert.equal(f.bridge.reason, 'native-factory-unavailable');
});

test('a changed native artifact is never replaced with stale compiled code', () => {
  const f = bridgeFixture();
  f.bridge.activate();
  const changed = { id: WORKSPACE_MODULE, factory: () => 'new native' };
  f.loader.load(changed);
  assert.equal(f.received[0], changed);
  assert.equal(f.bridge.reason, 'native-factory-changed');
});

test('a broken observer cannot interrupt native fallback or unload', () => {
  const f = bridgeFixture();
  let calls = 0;
  f.bridge.subscribe(() => { throw Error('observer failed'); });
  f.bridge.subscribe(() => calls++);
  const dispose = f.bridge.activate();
  f.bridge.fail('contract-changed');
  dispose();
  assert.equal(calls, 3);
  assert.equal(f.bridge.enabled, false);
  assert.equal(f.loader.load, f.initialLoad);
});

test('bridge follows the native queue-to-live transition and preserves intervening plugin wrappers', () => {
  const f = bridgeFixture();
  const live = value => f.received.push(value);
  f.loader.load = live; // Official ClientModuleSystem replaces the early facade.
  f.loader.load(f.native);
  assert.equal(f.received.at(-1).factory(), 'enhanced');
  const dispose = f.bridge.activate();
  let otherCalls = 0;
  const previous = f.loader.load;
  const other = value => { otherCalls++; return previous(value); };
  f.loader.load = other;
  f.loader.load(f.native);
  assert.equal(f.received.at(-1).factory(), 'enhanced');
  dispose();
  assert.equal(f.loader.load, other);
  f.loader.load(f.native);
  assert.equal(f.received.at(-1), f.native);
  assert.equal(otherCalls, 2);
});
