import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../src/model.mjs';

const source = fs.readFileSync(new URL('../src/client.mjs', import.meta.url), 'utf8');
test('changed native private imports leave browser construction on the original component', () => {
  const faults = [];
  const context = vm.createContext({ window: { __DSH_SESSION_INBOX_BRIDGE__: { fail: reason => faults.push(reason) } },
    console: { warn() {} } });
  vm.runInContext(source, context);
  const original = () => 'native';
  assert.equal(context.createInboxBrowser(original, {}), original);
  assert.deepEqual(faults, ['browser-construction-unavailable']);
});
test('conditional native actions and service capabilities are checked before enhancement', () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const props = Object.fromEntries(['useSessions', 'useSessionStatus', 'useWorkspaces', 'usePanelInfo',
    'open', 't', 'renderSlot', 'requestSessionRename', 'unarchiveSession'].map(key => [key, () => {}]));
  const ctx = { sessions: { refresh() {}, refreshProjections() {} } };
  assert.equal(context.inboxBrowserCapabilities(props, ctx), true);
  for (const key of ['open', 'renderSlot', 'requestSessionRename', 'unarchiveSession']) {
    assert.equal(context.inboxBrowserCapabilities({ ...props, [key]: undefined }, ctx), false);
  }
  const unified = { ...props, ...Object.fromEntries(['useContextMenu', 'useContextMenuTarget', 'useSessionAccess', 'openSessionMenu'].map(key => [key, () => {}])) };
  assert.equal(context.inboxBrowserCapabilities(unified, ctx), true);
  assert.equal(context.inboxBrowserCapabilities({ ...unified, openSessionMenu: undefined }, ctx), false);
  assert.equal(context.inboxBrowserCapabilities(props, { sessions: { refresh() {} } }), false);
});
test('sync action errors and rejected async actions request native fallback without escaping', async () => {
  const faults = [];
  const context = vm.createContext({ window: { __DSH_SESSION_INBOX_BRIDGE__: { fail: reason => faults.push(reason) } }, console: { warn() {} } });
  vm.runInContext(source, context);
  context.inboxRunNative(() => { throw Error('changed callback'); });
  context.inboxRunNative(() => Promise.reject(Error('changed async callback')));
  context.inboxRunNative(() => undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(faults, ['browser-action-unavailable', 'browser-action-unavailable']);
});
const h = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) });
function nodes(tree) {
  return !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(nodes), ...nodes(tree.props.anchor)];
}

function rowFixture({ blank = false, renamable = true, active = null, legacy = false, accessHook = true } = {}) {
  const calls = [];
  const react = { createElement: h, Component: class {}, Fragment: 'Fragment',
    useState: value => [typeof value === 'function' ? value() : value, next => calls.push({ kind: 'state', next })],
    useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }), useEffect: () => {} };
  const context = vm.createContext({ ...model, react, window: {}, INBOX_PLUGIN_VERSION: 'test', INBOX_HAS_LEADING_SLOT: true,
    localStorage: { getItem: () => blank
      ? JSON.stringify({ ...model.inboxEmptyState(), settled: { chat: { stamp: '100', at: 200 } }, collapsed: {} }) : null },
    workspaceDisplayTitle: title => title,
    _deepseek_ai_dsh_client_ui_primitives: new Proxy({}, { get: (_, name) => name }),
    SessionHoverContent: 'SessionHoverContent', inboxRelativeTime: () => 'now' });
  vm.runInContext(source, context);
  const session = { id: 'chat', title: 'Session', updatedAt: 100, blank };
  const browser = context.createInboxBrowser('OriginalBrowser', { sessions: { refresh() {}, refreshProjections() {} } });
  const props = {
    open() {},
    unarchiveSession() {}, expandSidebar() {},
    useSessions: select => select({ phase: 'ready', ids: ['chat'], byId: { chat: session } }),
    useSessionStatus: select => select(new Map()),
    useWorkspaces: select => select({ items: [], archivedSessionIds: [], pinnedSessionIds: [] }),
    usePanelInfo: select => select({ activePanelId: null }),
    useWorkspaceShortcuts: select => select({ searchRequest: 0 }),
    useContextMenu: () => ({ getTriggerProps(target) {
      calls.push({ kind: 'trigger', target });
      return target ? { tabIndex: 0, onContextMenu: 'native-context', onKeyDown: 'native-keyboard' } : {};
    } }),
    useContextMenuTarget: select => select(active),
    useSessionAccess: (id, action) => { calls.push({ kind: 'access', id, action }); return renamable; },
    openSessionMenu: (...args) => calls.push({ kind: 'menu', args }),
    requestSessionRename: (...args) => calls.push({ kind: 'rename', args }),
    renderSlot: (name, ...args) => { calls.push({ kind: 'slot', name, args }); return null; },
    t: key => key,
  };
  if (legacy) {
    delete props.useContextMenu;
    delete props.useContextMenuTarget;
    delete props.openSessionMenu;
  }
  if (!accessHook) delete props.useSessionAccess;
  const gate = browser(props);
  const inbox = gate.children[0];
  const row = nodes(inbox.type(inbox.props)).find(node => node.type.name === 'InboxRow');
  assert.ok(row, 'session row must render');
  let tree = row.type(row.props);
  while (typeof tree.type === 'function') tree = tree.type(tree.props);
  return { calls, tree, anchor: tree.props.anchor,
    menu: nodes(tree.props.anchor).find(node => node.props.className === 'dsi-icon-button'),
    title: nodes(tree.props.anchor).find(node => node.props.className === 'dsi-title') };
}

test('session row delegates pointer and keyboard menus to the 0.2.2 context-menu owner', () => {
  const fixture = rowFixture({ active: { kind: 'session', value: { sessionId: 'chat' } } });
  assert.equal(fixture.anchor.props.onContextMenu, 'native-context');
  assert.equal(fixture.anchor.props.onKeyDown, 'native-keyboard');
  assert.equal(fixture.menu.props['aria-expanded'], true);
  assert.equal(fixture.tree.props.disabled, true, 'hover card must close while the native menu is open');
  const target = fixture.calls.find(call => call.kind === 'trigger').target;
  assert.equal(target.kind, 'session');
  assert.equal(target.value.sessionId, 'chat');
  assert.equal(target.value.displayTitle, 'Session');
  assert.ok(!fixture.calls.some(call => call.name === 'sidebar.workspaces.session.menu.item'),
    'legacy extension slot belongs to contextMenu.content in 0.2.2');
});

test('ellipsis toggles the full native menu at the focused button, including built-in actions', () => {
  const fixture = rowFixture();
  let focused = false;
  fixture.menu.props.onClick({ currentTarget: { focus() { focused = true; },
    getBoundingClientRect: () => ({ left: 21, bottom: 87 }) } });
  assert.equal(focused, true);
  const args = fixture.calls.find(call => call.kind === 'menu').args;
  assert.deepEqual(JSON.parse(JSON.stringify(args)), ['chat', 'Session', { x: 21, y: 87 }, 'toggle']);
});

test('blank rows do not expose a session menu, and rename honors current native access', () => {
  const blank = rowFixture({ blank: true });
  assert.equal(blank.calls.find(call => call.kind === 'trigger').target, undefined);
  assert.equal(blank.menu.props.disabled, true);
  assert.equal(blank.title.props.onDoubleClick, undefined);
  assert.equal(rowFixture({ renamable: false }).title.props.onDoubleClick, undefined);
  const allowed = rowFixture();
  allowed.title.props.onDoubleClick({ stopPropagation() {} });
  assert.deepEqual(allowed.calls.find(call => call.kind === 'rename').args, ['chat', 'Session']);
});

test('legacy rows retain native menu entries and their open-state hook context', () => {
  const fixture = rowFixture({ legacy: true });
  const entry = fixture.calls.find(call => call.name === 'sidebar.workspaces.session.menu.item');
  assert.equal(entry.args[0].sessionId, 'chat');
  assert.equal(entry.args[0].displayTitle, 'Session');
  assert.equal(entry.args[1].hookContext[0], false);
  assert.equal(typeof entry.args[1].hookContext[1], 'function');
  for (const [handler, event] of [['onContextMenu', {}], ['onKeyDown', { key: 'F10', shiftKey: true }]]) {
    let prevented = false;
    fixture.anchor.props[handler]({ ...event, currentTarget: { querySelector: () => null },
      preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    assert.equal(fixture.calls.at(-1).next, true);
  }
  assert.equal(rowFixture({ legacy: true, blank: true }).anchor.props.onContextMenu, undefined);
  assert.equal(rowFixture({ legacy: true, renamable: false }).title.props.onDoubleClick, undefined);
  assert.equal(typeof rowFixture({ legacy: true, accessHook: false }).title.props.onDoubleClick, 'function');
});
