/** Portable list metadata only. No titles, paths, conversation bodies, account data or credentials. */
import { inboxParseState, inboxReconcile } from './model.mjs';

export const INBOX_BACKUP_LIMIT = 2 * 1024 * 1024;

export function inboxExportBackup(state, now = Date.now()) {
  const parsed = inboxParseState(JSON.stringify(state));
  return JSON.stringify({ format: 'dsh-session-inbox-backup', version: 1,
    exportedAt: new Date(now).toISOString(), state: {
      version: parsed.version, mode: 'inbox', groupByProject: parsed.groupByProject,
      includeArchived: parsed.includeArchived, collapsed: parsed.collapsed, settled: parsed.settled,
    },
  }, null, 2) + '\n';
}

/** Validate the entire file before any write; unknown formats cannot reset live metadata. */
export function inboxParseBackup(text) {
  if (text.length > INBOX_BACKUP_LIMIT) throw new Error('备份文件过大，最多支持 2 MB。');
  const value = JSON.parse(text);
  if (!value || value.format !== 'dsh-session-inbox-backup' || value.version !== 1
      || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error('这不是受支持的会话工作台备份。');
  }
  const state = inboxParseState(JSON.stringify(value.state));
  if (Object.keys(state.settled).length > 20_000) throw new Error('备份中的整理记录过多。');
  return { exportedAt: value.exportedAt, state };
}

/** Merge rather than replace: keep current records and never hide new activity or unattended work. */
export function inboxMergeBackup(current, backup, rows, restorePreferences = false) {
  const settled = { ...current.settled };
  for (const [id, mark] of Object.entries(backup.state.settled)) {
    if (!settled[id] || mark.at > settled[id].at) settled[id] = { ...mark };
  }
  const preferences = restorePreferences ? {
    groupByProject: backup.state.groupByProject,
    includeArchived: backup.state.includeArchived,
    collapsed: { ...backup.state.collapsed },
  } : {};
  return inboxReconcile({ ...current, ...preferences, settled }, rows);
}
