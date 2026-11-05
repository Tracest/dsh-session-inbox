import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/shell.mjs', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const sidebar = fs.readFileSync(new URL('../vendor/sidebar-client-0.2.2-rc.1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const currentSidebarCss = [...sidebar.matchAll(/^\s*const css(?:\$\d)? = ("(?:\\.|[^"\\])*");$/gm)]
  .map(match => JSON.parse(match[1])).find(css => css.includes('.hHd-Xa_root'));
const windowsSidebarCss = fs.readFileSync(new URL('./fixtures/sidebar-windows-0.2.1-rc.5.css', import.meta.url), 'utf8');
const nativeSheets = ['WorkspaceBrowser', 'Rows', 'WorkspacePicker'];
const versions = JSON.parse(fs.readFileSync(new URL('../compatibility.json', import.meta.url), 'utf8')).dshVersions;

/** Both native compatibility CSS and the compact shell belong to this plugin.
 * Reloading the shell may replace only its own sheet, never the native fallback. */
function shellFixture(sidebarCss = currentSidebarCss) {
  const styles = [];
  const listeners = new Set();
  const mode = { value: 'inbox' };
  const element = () => ({ dataset: {}, textContent: '', remove() {
    const index = styles.indexOf(this);
    if (index >= 0) styles.splice(index, 1);
  } });
  styles.push(Object.assign(element(), { dataset: { plugin: '@deepseek-ai/dsh-client-ui-sidebar',
    pluginCss: '@deepseek-ai/dsh-client-ui-sidebar/SidebarRoot.module.css' }, textContent: sidebarCss }));
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
  const context = vm.createContext({ document, INBOX_CSS: template,
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
  assert.equal(fixture.styles.filter(style => style.dataset.inboxShell === 'dsh-session-inbox').length, 1);
  fixture.switchMode('original');
  assert.equal(fixture.document.documentElement.dataset.inboxMode, 'original');
  disposeNew();
  assert.deepEqual(fixture.styles, original);
});

for (const [platform, css, prefix] of [['0.2.2-rc.1 npm', currentSidebarCss, 'hHd-Xa'], ['0.2.1-rc.5 Windows fixture', windowsSidebarCss, 'wtg9ga']]) {
  test(`${platform} compact selectors use the loaded official sidebar hashes`, () => {
    const fixture = shellFixture(css);
    const dispose = fixture.start();
    const actual = fixture.styles.find(style => style.dataset.inboxShell === 'dsh-session-inbox').textContent;
    assert.ok(actual.includes(`html[data-inbox-mode="inbox"] .${prefix}_root:not(.${prefix}_collapsed)`));
    assert.ok(actual.includes(`.${prefix}_panelList{grid-area:nav;display:grid;`));
    assert.ok(actual.includes(`.${prefix}_regionArea{grid-area:region;`));
    assert.ok(!actual.includes('.dsi-shell-'), 'unresolved shell alias');
    assert.ok(!actual.includes(`.${prefix === 'wtg9ga' ? 'hHd-Xa' : 'wtg9ga'}_root`));
    dispose();
  });
}

test('missing and ambiguous native classes fail before replacing the current shell', () => {
  for (const invalidCss of [windowsSidebarCss.replaceAll('.wtg9ga_panelList', '.unrelated'),
    windowsSidebarCss + '\n.another_root{}']) {
    const fixture = shellFixture(invalidCss);
    const original = [...fixture.styles];
    assert.throws(() => fixture.start(), /missing or ambiguous/);
    assert.deepEqual(fixture.styles, original);
  }
});

test('another plugin cannot supply the native sidebar class map', () => {
  const fixture = shellFixture();
  fixture.styles[0].dataset.plugin = 'another-plugin';
  assert.throws(() => fixture.start(), /one loaded native SidebarRoot stylesheet/);
});

for (const version of [...versions, '0.2.2-rc.1+desktop.1']) test(`${version} selects only its own native adapter and fallback styles`, () => {
  const upstream = fs.readFileSync(new URL(`../vendor/workspace-client-${version.split('+')[0]}.js`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const expected = [...upstream.matchAll(/^\s*const css(?:\$\d)? = ("(?:\\.|[^"\\])*");$/gm)]
    .map(match => JSON.parse(match[1]));
  const styles = [];
  let factory;
  vm.runInNewContext(fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __DSH_SESSION_INBOX_HOST__: { version }, __ModuleLoader__: { load(module) { factory = module.factory; } } },
    document: { querySelector: () => null, createElement: () => ({ dataset: {} }),
      head: { appendChild(style) { styles.push(style); } } },
  });
  const exports = factory(name => {
    if (name === 'react') return { Component: class {} };
    if (name === '@deepseek-ai/cordis') return { Service: class {} };
    return {};
  });
  assert.equal(typeof exports.apply, 'function');
  assert.equal(exports.inject.includes('contextMenus'), upstream.includes('"contextMenus"'), 'menu dependencies must follow this host');
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-context-menu'));
  const expectedIds = [...upstream.matchAll(/^\s*const tagId(?:\$\d+)? = ("(?:\\.|[^"\\])*");$/gm)]
    .map(match => JSON.parse(match[1]).replace('@deepseek-ai/dsh-client-ui-workspace', 'dsh-session-inbox'));
  assert.ok(expected.length >= 3);
  assert.equal(expectedIds.length, expected.length);
  assert.deepEqual(styles.map(style => style.textContent), expected);
  assert.deepEqual(styles.map(style => style.dataset.pluginCss), expectedIds);
});

test('unknown hosts fail before loading a native adapter or injecting CSS', () => {
  const compiled = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  for (const version of [undefined, '0.2.2-rc.2', '0.3.0']) {
    let factory;
    vm.runInNewContext(compiled, {
      window: { __DSH_SESSION_INBOX_HOST__: { version }, __ModuleLoader__: { load(module) { factory = module.factory; } } },
    });
    assert.throws(() => factory(() => { throw new Error('must not import native code'); }), /Unsupported DSH version/);
  }
});

for (const version of versions) test(`${version} resolves the actual sidebar stylesheet, including older optional wrappers`, () => {
  const original = fs.readFileSync(new URL(`../vendor/sidebar-client-${version}.js`, import.meta.url), 'utf8');
  const css = [...original.matchAll(/^\s*const css(?:\$\d)? = ("(?:\\.|[^"\\])*");$/gm)]
    .map(match => JSON.parse(match[1])).find(value => /\.[\w-]+_root(?![\w-])/.test(value));
  const fixture = shellFixture(css);
  fixture.start();
  const installed = fixture.styles.find(style => style.dataset.inboxShell === 'dsh-session-inbox').textContent;
  assert.ok(!installed.includes('.dsi-shell-'));
  assert.equal(fixture.document.documentElement.dataset.inboxMode, 'inbox');
});
