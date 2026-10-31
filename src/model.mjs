/** Pure presentation state. No session, archive, task or transcript is ever mutated here. */
export const INBOX_STORAGE_KEY = 'dsh-session-inbox:state:v1';

export function inboxEmptyState() {
  return { version: 1, mode: 'inbox', groupByProject: false, includeArchived: true, settled: {}, collapsed: { settled: true } };
}

/** Reject corrupt/future records instead of silently overwriting the user's metadata. */
export function inboxParseState(raw) {
  if (raw === null) return inboxEmptyState();
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || !['inbox', 'original'].includes(value.mode)
      || typeof value.groupByProject !== 'boolean' || !value.settled || !value.collapsed
      || typeof value.settled !== 'object' || typeof value.collapsed !== 'object'
      || Array.isArray(value.settled) || Array.isArray(value.collapsed)) {
    throw new Error('整理记录的格式不受支持，原数据已保留。');
  }
  for (const [id, entry] of Object.entries(value.settled)) {
    if (['__proto__', 'constructor', 'prototype'].includes(id) || !entry
        || typeof entry.stamp !== 'string' || !Number.isFinite(entry.at)) {
      throw new Error('整理记录无法读取，原数据已保留。');
    }
  }
  for (const collapsed of Object.values(value.collapsed)) {
    if (typeof collapsed !== 'boolean') throw new Error('折叠状态无法读取。');
  }
  if (value.includeArchived !== undefined && typeof value.includeArchived !== 'boolean') {
    throw new Error('归档显示选项无法读取。');
  }
  return { ...value, includeArchived: value.includeArchived ?? true };
}

export function inboxActivityStamp(session) {
  return String(session.updatedAt ?? 0);
}

/** Short labels keep dates from squeezing the conversation title. */
export function inboxRelativeTime(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** T3's inbox is untitled; only unattended execution belongs in the lower Working shelf. */
export function inboxCategory(row, state) {
  if (row.pending) return 'active';
  if (row.running) return 'working';
  const mark = state.settled[row.id];
  return mark && !inboxHasNewActivity(row, mark) ? 'settled' : 'active';
}

/** Preserve project folds from prior layouts; the untitled inbox itself cannot be collapsed. */
export function inboxCollapsed(state, category, projectId) {
  if (category === 'active' && projectId === undefined) return false;
  if (projectId === undefined) return state.collapsed[category === 'working' ? 'running' : category] === true;
  const key = `${category}:${projectId}`;
  const legacy = category === 'active'
    ? state.collapsed[`attention:${projectId}`] ?? state.collapsed[`working:${projectId}`]
    : false;
  return (state.collapsed[key] ?? legacy) === true;
}

/** Finished work and restored chats return to the top without changing durable activity stamps. */
export function inboxPartition(rows, state, returnedAt = {}) {
  const groups = { active: [], working: [], settled: [] };
  for (const row of rows) groups[inboxCategory(row, state)].push(row);
  groups.active.sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || Math.max(b.updatedAt, returnedAt[b.id] ?? 0) - Math.max(a.updatedAt, returnedAt[a.id] ?? 0));
  return groups;
}

/** Lazy history hydration may replace a zero/stale timestamp with an older prompt.
 * Only activity newer than both the recorded prompt and the actual Settle time reopens it. */
export function inboxHasNewActivity(row, mark) {
  const current = Number(row.stamp);
  const recorded = Number(mark.stamp);
  return Number.isFinite(current) && current > Math.max(Number.isFinite(recorded) ? recorded : 0, mark.at);
}

export function inboxSettle(state, row, now = Date.now()) {
  if (row.running || row.pending || row.blank) return state;
  return { ...state, settled: { ...state.settled, [row.id]: { stamp: row.stamp, at: now } } };
}

export function inboxRestore(state, id) {
  const settled = { ...state.settled };
  delete settled[id];
  return { ...state, settled };
}

/** Missing catalog rows may be reconnecting. Never erase their metadata during a partial baseline. */
export function inboxReconcile(state, rows) {
  let next = state;
  for (const row of rows) {
    const mark = next.settled[row.id];
    if (mark && (row.running || row.pending || inboxHasNewActivity(row, mark))) {
      next = inboxRestore(next, row.id);
    }
  }
  return next;
}

/** Project membership comes from DSH, not from guesses about titles or folder names. */
export function inboxRows(list, workspaces, statuses, archivedIds, pinnedIds, preservedBlankIds = []) {
  const projects = new Map();
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) projects.set(id, workspace);
  }
  const archived = new Set(archivedIds);
  const pinned = new Set(pinnedIds);
  const preservedBlanks = new Set(preservedBlankIds);
  // Grouped membership may arrive before the flat catalog during a reconnect.
  const ids = [...new Set([...workspaces.flatMap(project => project.sessionIds), ...list.ids])];
  return ids.flatMap(id => {
    const session = list.byId[id];
    if (!session || session.origin === 'subagent' || (session.blank && !preservedBlanks.has(id))) return [];
    const status = statuses.get(id);
    const children = list.projectionsBySession?.[id]?.values?.subagentCatalog ?? [];
    const childRunning = children.some(child => (statuses.get(child.id)?.running ?? list.byId[child.id]?.running) === true);
    const project = projects.get(id);
    return [{
      id, title: session.blank ? '空会话' : (session.title?.trim() || '未命名会话'),
      stamp: inboxActivityStamp(session), updatedAt: Number(session.updatedAt) || 0,
      blank: session.blank === true, archived: archived.has(id), pinned: pinned.has(id),
      running: (status?.running ?? session.running) === true || childRunning,
      pending: status?.pendingInteraction?.kind ?? null,
      completionUnread: status?.completionUnread === true,
      projectId: project?.workspaceId ?? '', projectTitle: project?.title ?? '未分组',
      path: project?.path ?? '',
    }];
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export function inboxFilterRows(rows, query, projectId, includeArchived) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter(row => (includeArchived || !row.archived)
    && (projectId === '*' || row.projectId === projectId)
    && (!search || `${row.title} ${row.projectTitle} ${row.path}`.toLocaleLowerCase().includes(search)));
}
