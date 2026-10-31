import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/shell.mjs', import.meta.url), 'utf8');
const nativeSheets = ['Rows', 'AnimatedRows', 'WorkspacePicker', 'WorkspaceBrowser'];

/** Both native compatibility CSS and the compact shell belong to this plugin.
 * Reloading the shell may replace only its own sheet, never the native fallback. */
function shellFixture() {
  const styles = [];
  const listeners = new Set();
  const mode = { value: 'inbox' };
  const element = () => ({ dataset: {}, textContent: '', remove() {
    const index = styles.indexOf(this);
    if (index >= 0) styles.splice(index, 1);
  } });
  for (const name of nativeSheets) {
    styles.push(Object.assign(element(), { dataset: { plugin: 'dsh-session-inbox',
      pluginCss: `dsh-session-inbox/${name}.module.css` }, textContent: `${name} native styles` }));
  }
  styles.push(Object.assign(element(), { dataset: { plugin: 'another-plugin' }, textContent: 'other styles' }));
  const document = {
    documentElement: { dataset: {} }, createElement: element,
    head: { appendChild(style) { styles.push(style); } },
    querySelectorAll(selector) {
      const attribute = selector.match(/^style\[data-([a-z-]+)="([^"]+)"\]$/);
      if (!attribute) throw new Error(`Unsupported selector: ${selector}`);
      const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return styles.filter(style => style.dataset[key] === attribute[2]);
    },
  };
  const context = vm.createContext({ document, INBOX_CSS: 'scoped compact shell styles',
    inboxReadModeSnapshot: () => mode.value,
    inboxSubscribeMode: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  });
  vm.runInContext(source, context);
  const start = () => {
    let dispose;
    context.inboxInstallShell({ effect(callback) { dispose = callback(); } });
    return dispose;
  };
  return { styles, document, listeners, start, switchMode(value) {
    mode.value = value;
    listeners.forEach(listener => listener());
  } };
}

test('mounting and switching layouts keep all native CSS and unrelated plugin sheets', () => {
  const fixture = shellFixture();
  const original = [...fixture.styles];
  const dispose = fixture.start();
  for (const mode of ['original', 'inbox', 'original']) {
    fixture.switchMode(mode);
    assert.equal(fixture.document.documentElement.dataset.inboxMode, mode);
    assert.ok(original.every(style => fixture.styles.includes(style)), 'native fallback CSS was removed');
  }
  dispose();
  assert.deepEqual(fixture.styles, original);
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.document.documentElement.dataset.inboxMode, undefined);
});

test('disposing a stale shell after replacement cannot remove the current mode or native sheets', () => {
  const fixture = shellFixture();
  const original = [...fixture.styles];
  const disposeOld = fixture.start();
  const disposeNew = fixture.start();
  disposeOld();
  assert.equal(fixture.document.documentElement.dataset.inboxMode, 'inbox');
  assert.ok(original.every(style => fixture.styles.includes(style)));
  assert.equal(fixture.styles.filter(style => style.textContent === 'scoped compact shell styles').length, 1);
  fixture.switchMode('original');
  assert.equal(fixture.document.documentElement.dataset.inboxMode, 'original');
  disposeNew();
  assert.deepEqual(fixture.styles, original);
});

test('the published browser bundle retains all four original native CSS payloads byte-for-byte', () => {
  const upstream = fs.readFileSync(new URL('../vendor/workspace-client-0.2.1-rc.5.js', import.meta.url), 'utf8');
  const expected = [...upstream.matchAll(/^\s*const css(?:\$\d)? = ("(?:\\.|[^"\\])*");$/gm)]
    .map(match => JSON.parse(match[1]));
  const styles = [];
  let factory;
  vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(module) { factory = module.factory; } } },
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }),
      head: { appendChild(style) { styles.push(style); } } },
  });
  const exports = factory(name => {
    if (name === 'react') return { Component: class {} };
    if (name === '@deepseek-ai/cordis') return { Service: class {} };
    return {};
  });
  assert.equal(typeof exports.apply, 'function');
  assert.equal(expected.length, 4);
  assert.deepEqual(styles.map(style => style.textContent), expected);
  assert.deepEqual(styles.map(style => style.dataset.pluginCss), nativeSheets.map(name => `dsh-session-inbox/${name}.module.css`));
});
