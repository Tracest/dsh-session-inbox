import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxEmptyState, inboxParseState, inboxCategory, inboxSettle, inboxRestore,
  inboxReconcile, inboxRows, inboxFilterRows, inboxCollapsed } from '../src/model.mjs';

const row = (patch = {}) => ({ id: 'a', title: '历史会话', stamp: '100', updatedAt: 100,
  blank: false, running: false, pending: null, archived: false, projectId: 'p',
  projectTitle: '项目甲', path: '/project/a', ...patch });

test('Settle and restore edit only plugin metadata and preserve the session object', () => {
  const session = Object.freeze(row());
  const state = inboxSettle(inboxEmptyState(), session, 200);
  assert.equal(inboxCategory(session, state), 'settled');
  assert.equal(inboxCategory(session, inboxRestore(state, 'a')), 'working');
  assert.equal(session.title, '历史会话');
  assert.deepEqual(Object.keys(state.settled), ['a']);
});

test('pending approval, question, and plan review remain visible even when running', () => {
  const settled = inboxSettle(inboxEmptyState(), row(), 200);
  for (const pending of ['approval', 'question', 'plan-review']) {
    const active = row({ running: true, pending });
    assert.equal(inboxCategory(active, settled), 'working');
    assert.equal(inboxSettle(settled, active), settled);
  }
});

test('ongoing work cannot be accidentally hidden or stopped by Settle', () => {
  const state = inboxEmptyState();
  const busy = row({ running: true });
  assert.equal(inboxSettle(state, busy), state);
  assert.equal(inboxCategory(busy, state), 'working');
});

test('a resumed settled session remains on the Working shelf after completion', () => {
  let state = inboxSettle(inboxEmptyState(), row(), 200);
  state = inboxReconcile(state, [row({ running: true })]);
  assert.equal(inboxCategory(row({ running: true }), state), 'working');
  assert.equal(inboxCategory(row(), state), 'working');
});

test('new user activity reopens a settled session after an offline interval', () => {
  const state = inboxSettle(inboxEmptyState(), row(), 200);
  const resumed = row({ stamp: '300', updatedAt: 300 });
  assert.equal(inboxCategory(resumed, state), 'working');
  assert.deepEqual(inboxReconcile(state, [resumed]).settled, {});
});

test('reconnecting or incomplete catalogs never erase existing Settle records', () => {
  const state = inboxSettle(inboxEmptyState(), row(), 200);
  assert.equal(inboxReconcile(state, []), state);
  assert.equal(inboxReconcile(state, [row()]), state);
});

test('metadata survives serialization, original-list switching, and back', () => {
  const state = { ...inboxSettle(inboxEmptyState(), row(), 200), mode: 'original' };
  const restored = inboxParseState(JSON.stringify(state));
  assert.equal(restored.mode, 'original');
  assert.equal(inboxCategory(row(), { ...restored, mode: 'inbox' }), 'settled');
});

test('corrupt and future metadata is rejected without replacing its source', () => {
  for (const raw of ['{', '{"version":2}', 'null', '{"version":1,"mode":"wrong"}']) {
    assert.throws(() => inboxParseState(raw));
  }
  const malicious = '{"version":1,"mode":"inbox","groupByProject":true,"settled":{"__proto__":{"stamp":"a","at":1}},"collapsed":{}}';
  assert.throws(() => inboxParseState(malicious));
  assert.equal({}.stamp, undefined);
});

test('workspace identity, subagent activity, archived rows, and blank rows use DSH facts', () => {
  const list = { ids: ['a', 'b', 'child', 'blank', 'other-blank'], byId: {
    a: { id: 'a', title: '历史一', updatedAt: 10, running: false },
    b: { id: 'b', title: '历史二', updatedAt: 20, running: false },
    child: { id: 'child', origin: 'subagent', title: '子任务', running: true },
    blank: { id: 'blank', blank: true, retainedBy: { mainView: 1 } },
    'other-blank': { id: 'other-blank', blank: true },
  }, projectionsBySession: { a: { values: { subagentCatalog: [{ id: 'child' }] } } } };
  const projects = [{ workspaceId: 'p', title: '真正的项目', path: '/p', sessionIds: ['a'] }];
  const rows = inboxRows(list, projects, new Map(), ['b'], ['a']);
  assert.deepEqual(rows.map(x => x.id), ['a', 'b']);
  assert.equal(rows[0].running, true);
  assert.equal(rows[0].projectTitle, '真正的项目');
  assert.equal(rows[1].archived, true);
  assert.equal(rows[1].projectTitle, '未分组');
  assert.equal(inboxFilterRows(rows, '', '*', false).length, 1);
  assert.equal(inboxFilterRows(rows, '真正', '*', true).length, 1);
});

test('catalog derivation does not change original session or workspace membership', () => {
  const list = { ids: ['a'], byId: { a: { id: 'a', title: '历史', updatedAt: 1 } } };
  const projects = [{ workspaceId: 'p', title: '项目', sessionIds: ['a'] }];
  const before = JSON.stringify({ list, projects });
  inboxRows(list, projects, new Map(), [], []);
  assert.equal(JSON.stringify({ list, projects }), before);
});

test('known workspace history remains visible before the flat catalog catches up', () => {
  const list = { ids: [], byId: { a: { id: 'a', title: '保留历史', updatedAt: 1 } } };
  const projects = [{ workspaceId: 'p', title: '项目', sessionIds: ['a'] }];
  assert.equal(inboxRows(list, projects, new Map(), [], []).length, 1);
});

test('a native archived chat may be soft-settled without changing its archive flag', () => {
  const archived = Object.freeze(row({ archived: true }));
  const state = inboxSettle(inboxEmptyState(), archived, 300);
  assert.equal(inboxCategory(archived, state), 'settled');
  assert.equal(archived.archived, true);
});

test('legacy preferences retain all Settle records and archived-history visibility', () => {
  const legacy = { ...inboxSettle(inboxEmptyState(), row(), 300), mode: 'original' };
  delete legacy.includeArchived;
  const state = inboxParseState(JSON.stringify(legacy));
  assert.equal(state.includeArchived, true);
  assert.deepEqual(state.settled, legacy.settled);
  assert.equal(state.mode, 'original');
});

test('hydrating an older prompt never clears a user Settle mark', () => {
  const state = inboxSettle(inboxEmptyState(), row({ stamp: '0' }), 1000);
  const hydrated = row({ stamp: '700', updatedAt: 700 });
  assert.equal(inboxCategory(hydrated, state), 'settled');
  assert.equal(inboxReconcile(state, [hydrated]), state);
  const newPrompt = row({ stamp: '1100', updatedAt: 1100 });
  assert.equal(inboxCategory(newPrompt, state), 'working');
  assert.deepEqual(inboxReconcile(state, [newPrompt]).settled, {});
});

test('a reconnect baseline with older activity cannot resurrect a settled chat', () => {
  const state = inboxSettle(inboxEmptyState(), row({ stamp: '900' }), 1000);
  const partialBaseline = row({ stamp: '100', updatedAt: 100 });
  assert.equal(inboxCategory(partialBaseline, state), 'settled');
  assert.equal(inboxReconcile(state, [partialBaseline]), state);
});

test('a blank chat explicitly settled before metadata hydration stays visible in settled', () => {
  const list = { ids: ['legacy', 'draft'], byId: {
    legacy: { id: 'legacy', blank: true, updatedAt: 400 },
    draft: { id: 'draft', blank: true, updatedAt: 500 },
  } };
  const rows = inboxRows(list, [], new Map(), [], [], ['legacy']);
  assert.deepEqual(rows.map(item => item.id), ['legacy']);
  const state = inboxSettle(inboxEmptyState(), row({ id: 'legacy', stamp: '0' }), 1000);
  assert.equal(inboxCategory(rows[0], state), 'settled');
  assert.equal(inboxReconcile(state, rows), state);
});

test('the Working shelf includes both idle and running unsettled chats', () => {
  const state = inboxEmptyState();
  assert.equal(inboxCategory(row(), state), 'working');
  assert.equal(inboxCategory(row({ running: true }), state), 'working');
  for (const pending of ['approval', 'question', 'plan-review']) {
    assert.equal(inboxCategory(row({ pending }), state), 'working');
    assert.equal(inboxSettle(state, row({ pending })), state);
  }
});

test('the merged shelf keeps old project folds without inheriting an empty running shelf fold', () => {
  const state = { ...inboxSettle(inboxEmptyState(), row(), 200),
    collapsed: { working: true, attention: true, 'attention:p': true, settled: true } };
  assert.equal(inboxCollapsed(state, 'working'), false);
  assert.equal(inboxCollapsed(state, 'working', 'p'), true);
  assert.equal(inboxCategory(row(), state), 'settled');
  const expandedProject = { ...state, collapsed: { ...state.collapsed, 'working:p': false } };
  assert.equal(inboxCollapsed(expandedProject, 'working', 'p'), false);
  const closedShelf = { ...state, collapsed: { ...state.collapsed, active: true } };
  assert.equal(inboxCollapsed(closedShelf, 'working'), true);
  assert.equal(inboxCollapsed(closedShelf, 'settled'), true);
});
