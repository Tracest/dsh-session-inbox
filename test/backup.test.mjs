import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxEmptyState, inboxSettle } from '../src/model.mjs';
import { inboxExportBackup, inboxParseBackup, inboxMergeBackup, INBOX_BACKUP_LIMIT } from '../src/backup.mjs';

const session = (id, patch = {}) => ({ id, stamp: '100', running: false, pending: null, blank: false, ...patch });

test('export roundtrips only list metadata, excluding transcript and unrecognized state fields', () => {
  const state = { ...inboxSettle(inboxEmptyState(), session('a'), 200), mode: 'original',
    collapsed: { settled: true, 'active:p': true }, secret: 'must not travel', title: 'private title' };
  const text = inboxExportBackup(state, 1000);
  assert.ok(!text.includes('must not travel'));
  assert.ok(!text.includes('private title'));
  const backup = inboxParseBackup(text);
  assert.deepEqual(backup.state.settled, state.settled);
  assert.deepEqual(backup.state.collapsed, state.collapsed);
  assert.equal(backup.state.mode, 'inbox');
  assert.equal(backup.exportedAt, new Date(1000).toISOString());
});

test('merge retains current records, takes the newer duplicate and leaves preferences alone by default', () => {
  const current = { ...inboxSettle(inboxSettle(inboxEmptyState(), session('current'), 500), session('duplicate'), 700),
    mode: 'original', groupByProject: true, includeArchived: false, collapsed: { settled: false } };
  const source = inboxSettle(inboxSettle(inboxEmptyState(), session('imported'), 400), session('duplicate'), 600);
  const backup = inboxParseBackup(inboxExportBackup(source));
  const before = JSON.stringify({ current, backup });
  const result = inboxMergeBackup(current, backup, []);
  assert.deepEqual(Object.keys(result.settled).sort(), ['current', 'duplicate', 'imported']);
  assert.equal(result.settled.duplicate.at, 700);
  assert.equal(result.mode, 'original');
  assert.equal(result.groupByProject, true);
  assert.equal(result.includeArchived, false);
  assert.equal(result.collapsed.settled, false);
  assert.equal(JSON.stringify({ current, backup }), before);
});

test('an explicit preference restore never changes the current layout mode', () => {
  const current = { ...inboxEmptyState(), mode: 'original', groupByProject: true };
  const backup = inboxParseBackup(inboxExportBackup(inboxEmptyState()));
  const result = inboxMergeBackup(current, backup, [], true);
  assert.equal(result.mode, 'original');
  assert.equal(result.groupByProject, false);
  assert.deepEqual(result.collapsed, { settled: true });
});

test('restoring old marks cannot hide running, waiting or newly active work; missing history is retained', () => {
  const ids = ['running', 'waiting', 'new', 'idle', 'offline'];
  let source = inboxEmptyState();
  for (const id of ids) source = inboxSettle(source, session(id), 200);
  const backup = inboxParseBackup(inboxExportBackup(source));
  const rows = [session('running', { running: true }), session('waiting', { pending: 'approval' }),
    session('new', { stamp: '300' }), session('idle')];
  const result = inboxMergeBackup(inboxEmptyState(), backup, rows);
  assert.deepEqual(Object.keys(result.settled).sort(), ['idle', 'offline']);
});

test('rejected input cannot produce a restorable backup or mutate live records', () => {
  const state = inboxSettle(inboxEmptyState(), session('a'), 200);
  const before = JSON.stringify(state);
  const valid = JSON.parse(inboxExportBackup(state));
  for (const raw of ['{', 'null', '[]', JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, format: 'another-app' }), JSON.stringify({ ...valid, exportedAt: 'wrong' }),
    JSON.stringify({ ...valid, state: { ...state, version: 2 } }), ' '.repeat(INBOX_BACKUP_LIMIT + 1)]) {
    assert.throws(() => inboxParseBackup(raw));
  }
  const poisoned = inboxExportBackup(state).replace('"a":', '"__proto__":');
  assert.throws(() => inboxParseBackup(poisoned));
  assert.equal({}.stamp, undefined);
  assert.equal(JSON.stringify(state), before);
});
