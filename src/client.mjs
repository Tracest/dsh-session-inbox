/** UI adapter, compiled inside the pinned workspace module to preserve DSH navigation and slot contracts. */
function createInboxBrowser(OriginalBrowser, ctx) {
  const h = react.createElement;
  const labels = { working: '工作中', settled: '已整理' };

  class InboxBoundary extends react.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { console.error('[dsh-session-inbox] Original list fallback:', error); }
    render() {
      return this.state.failed ? h(react.Fragment, null,
        h('div', { role: 'alert', className: 'dsi-notice' }, '工作台加载失败，已显示原列表。',
          h('button', { type: 'button', onClick: this.props.onOriginal }, '恢复原布局')),
        h(OriginalBrowser, this.props.originalProps)) : this.props.children;
    }
  }

  function SessionInboxBrowser(props) {
    const [record, setRecord] = react.useState(() => {
      try { return { state: inboxParseState(localStorage.getItem(INBOX_STORAGE_KEY)), error: null }; }
      catch (error) { return { state: inboxEmptyState(), error: String(error.message ?? error) }; }
    });
    const [query, setQuery] = react.useState('');
    const [projectId, setProjectId] = react.useState('*');
    const [viewOptionsOpen, setViewOptionsOpen] = react.useState(false);
    const [notice, setNotice] = react.useState(null);
    const [undo, setUndo] = react.useState(null);
    const [metadataLoading, setMetadataLoading] = react.useState(0);
    const [metadataErrors, setMetadataErrors] = react.useState(0);
    const [refreshEpoch, setRefreshEpoch] = react.useState(0);
    const [clock, setClock] = react.useState(Date.now);
    const requestedMetadata = react.useRef(new Set());
    const list = props.useSessions(snapshot => snapshot);
    const statuses = props.useSessionStatus(snapshot => snapshot);
    const storedProjects = props.useWorkspaces(snapshot => snapshot.items);
    const archivedIds = props.useWorkspaces(snapshot => snapshot.archivedSessionIds);
    const pinnedIds = props.useWorkspaces(snapshot => snapshot.pinnedSessionIds);
    const panel = props.usePanelInfo(snapshot => snapshot.activePanelId);
    const projects = react.useMemo(() => storedProjects.map(project => ({ ...project,
      title: workspaceDisplayTitle(project.title, props.t('workspace.defaultName')),
    })), [storedProjects, props.t]);
    const rows = react.useMemo(() => inboxRows(list, projects, statuses, archivedIds, pinnedIds, Object.keys(record.state.settled)),
      [list, projects, statuses, archivedIds, pinnedIds, record.state.settled]);
    const currentId = panel === null ? Object.values(list.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id : undefined;
    const state = record.state;
    const metadataIds = [...new Set([...storedProjects.flatMap(project => project.sessionIds), ...list.ids])].sort();
    const metadataKey = metadataIds.join('|');

    // Native rows lazily hydrate title/blank projections. The workbench also needs these
    // read-only hints before classification, or old chats can look like unnamed blanks.
    react.useEffect(() => {
      let cancelled = false;
      const pending = metadataIds.filter(id => !requestedMetadata.current.has(id));
      if (pending.length === 0) return;
      setMetadataLoading(pending.length);
      const run = async () => {
        let failures = 0;
        for (let offset = 0; offset < pending.length && !cancelled; offset += 4) {
          const batch = pending.slice(offset, offset + 4);
          batch.forEach(id => requestedMetadata.current.add(id));
          const results = await Promise.allSettled(batch.map(id => ctx.sessions.refreshProjections(id)));
          failures += results.filter(result => result.status === 'rejected').length;
          if (!cancelled) {
            setMetadataLoading(Math.max(0, pending.length - offset - batch.length));
            setMetadataErrors(failures);
          }
        }
      };
      run().catch(error => { if (!cancelled) setNotice(`历史摘要读取失败：${error.message ?? error}`); });
      return () => { cancelled = true; };
    }, [metadataKey, refreshEpoch, ctx]);

    // A write changes only plugin metadata. Re-read before each edit to avoid clobbering another window.
    const update = react.useCallback(change => {
      try {
        const previous = inboxParseState(localStorage.getItem(INBOX_STORAGE_KEY));
        const next = change(previous);
        localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(next));
        setRecord({ state: next, error: null });
        inboxPublishMode(next.mode);
        return true;
      } catch (error) {
        setRecord(previous => ({ ...previous, error: `无法保存整理状态：${error.message ?? error}` }));
        return false;
      }
    }, []);

    react.useEffect(() => {
      const timer = setInterval(() => setClock(Date.now()), 60_000);
      return () => clearInterval(timer);
    }, []);
    react.useEffect(() => {
      const onStorage = event => {
        if (event.key !== INBOX_STORAGE_KEY) return;
        try { setRecord({ state: inboxParseState(event.newValue), error: null }); }
        catch (error) { setRecord(previous => ({ ...previous, error: String(error.message ?? error) })); }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, []);
    react.useEffect(() => {
      if (record.error) return;
      if (inboxReconcile(state, rows) !== state) update(previous => inboxReconcile(previous, rows));
    }, [rows, state, record.error, update]);
    react.useEffect(() => {
      if (notice === null) return;
      const timer = setTimeout(() => { setNotice(null); setUndo(null); }, 6000);
      return () => clearTimeout(timer);
    }, [notice]);

    const setMode = mode => {
      if (!update(previous => ({ ...previous, mode }))) {
        // Even when browser storage is unavailable, the user must be able to reach the original list.
        setRecord(previous => ({ ...previous, state: { ...previous.state, mode } }));
        inboxPublishMode(mode);
      }
    };
    const toggleCollapsed = (key, legacyKey) => update(previous => ({ ...previous,
      collapsed: { ...previous.collapsed, [key]: !(previous.collapsed[key] ?? previous.collapsed[legacyKey]) },
    }));
    const settle = row => {
      if (update(previous => inboxSettle(previous, row))) {
        setUndo(row.id); setNotice(`已整理“${row.title}”，聊天记录仍保留。`);
      }
    };
    const restore = id => update(previous => inboxRestore(previous, id));
    const open = row => {
      if (row.archived) {
        props.unarchiveSession(row.id).then(() => props.open(row.id))
          .catch(error => setNotice(`无法恢复会话：${error.message ?? error}`));
      } else props.open(row.id);
    };
    const visible = inboxFilterRows(rows, query, projectId, state.includeArchived);
    const refresh = () => {
      requestedMetadata.current.clear();
      setMetadataErrors(0);
      setRefreshEpoch(value => value + 1);
      ctx.sessions.refresh()
        .then(() => setNotice('会话目录已刷新。'))
        .catch(error => setNotice(`会话目录刷新失败：${error.message ?? error}`));
    };

    function renderRow(row, category) {
      const pendingText = { approval: '等待审批', question: '等待回答', 'plan-review': '等待审阅' }[row.pending];
      const detail = row.pending ? pendingText || '等待处理' : row.archived ? '原生归档' : row.running ? '正在工作' : row.completionUnread ? '有新结果' : '';
      const blocked = row.blank || row.running || Boolean(row.pending) || Boolean(record.error);
      return h('div', { key: row.id, role: 'treeitem', className: `dsi-row${row.pending ? ' dsi-waiting' : row.running ? ' dsi-running' : ''}`,
        'aria-selected': currentId === row.id, 'data-inbox-session-id': row.id, 'data-inbox-category': category },
      h('button', { type: 'button', className: 'dsi-open', title: `${row.title}\n${row.projectTitle}${row.path ? `\n${row.path}` : ''}`,
        'aria-label': `${row.archived ? '恢复并打开' : '打开会话'}：${row.title}`, onClick: () => open(row) },
        h('span', { className: 'dsi-dot', 'aria-hidden': true }, row.pending ? '!' : row.pinned ? '•' : ''),
        h('span', { className: 'dsi-row-copy' }, h('span', { className: 'dsi-title' }, row.title),
          detail && h('span', { className: 'dsi-detail' }, detail))),
      h('span', { className: 'dsi-row-end' },
        h('time', { className: 'dsi-time', title: row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : undefined }, inboxRelativeTime(row.updatedAt, clock)),
      category === 'settled' ? h('button', { type: 'button', className: 'dsi-row-action',
        'aria-label': `恢复会话：${row.title}`, title: '恢复到工作中', onClick: () => restore(row.id) }, '↶')
        : h('button', { type: 'button', className: 'dsi-row-action', disabled: blocked,
          'aria-label': `Settle：${row.title}`, title: blocked ? '工作或等待回复结束后可整理' : 'Settle：整理到已整理，不删除记录',
          onClick: () => settle(row) }, '✓')));
    }

    function renderSection(category) {
      const members = visible.filter(row => inboxCategory(row, state) === category);
      const collapsed = inboxCollapsed(state, category);
      const groups = new Map();
      for (const row of members) {
        const key = state.groupByProject ? row.projectId : '*';
        if (!groups.has(key)) groups.set(key, { title: row.projectTitle, rows: [] });
        groups.get(key).rows.push(row);
      }
      return h('section', { key: category, className: `dsi-section dsi-${category}${members.length ? '' : ' dsi-section-empty'}`, 'data-inbox-section': category },
        h('div', { className: 'dsi-section-heading' }, h('button', { type: 'button', className: 'dsi-section-head', 'aria-expanded': !collapsed,
          'aria-label': `${labels[category]} ${members.length}`, onClick: () => toggleCollapsed(category === 'working' ? 'active' : category) },
          h('span', { 'aria-hidden': true }, collapsed ? '›' : '⌄'),
          h('span', null, labels[category]), h('span', { className: 'dsi-count' }, members.length)),
          category === 'settled' && h('button', { type: 'button', className: 'dsi-original-toggle', 'aria-label': '一键切回原布局',
            title: '一键恢复 DSH 原布局，保留聊天和整理记录', onClick: () => setMode('original') }, '原布局')),
        !collapsed && h('div', { className: 'dsi-section-body' }, members.length === 0 ? h('div', { className: 'dsi-empty' }, query.trim() ? '没有匹配的会话' : category === 'settled' ? '点会话右侧 ✓ 即可整理' : '暂无会话，点顶部按钮开始新会话')
          : [...groups].map(([key, group]) => {
            const groupKey = `${category}:${key}`;
            const closed = inboxCollapsed(state, category, key);
            return h('div', { key, className: 'dsi-project', 'data-inbox-project': key },
              state.groupByProject && h('button', { type: 'button', className: 'dsi-project-head',
                'aria-expanded': !closed, onClick: () => toggleCollapsed(groupKey, category === 'working' ? `attention:${key}` : undefined) },
                `${closed ? '›' : '⌄'}  ${group.title}`, h('span', { className: 'dsi-count' }, group.rows.length)),
              (!closed || !state.groupByProject) && h('div', { role: 'group' }, group.rows.map(row => renderRow(row, category))));
          })));
    }

    return h('div', { className: 'dsi-root', 'data-session-inbox-version': '0.3.1',
      'data-inbox-catalog-count': list.ids.length, 'data-inbox-summary-count': Object.keys(list.byId).length },
      state.mode === 'original' && h('div', { className: 'dsi-modebar' }, h('strong', null, '原生会话列表'),
        h('span', { className: 'dsi-mode-spacer' }),
        h('button', { type: 'button', 'aria-label': '刷新会话目录', title: '重新读取会话目录，不重启后台任务', onClick: refresh }, '⟳'),
        h('button', { type: 'button', onClick: () => setMode(state.mode === 'original' ? 'inbox' : 'original'),
          'aria-label': state.mode === 'original' ? '切到会话工作台' : '一键切回原布局' }, state.mode === 'original' ? '切到工作台' : '原布局')),
      record.error && h('div', { role: 'alert', className: 'dsi-notice' }, record.error),
      state.mode === 'original' ? h('div', { className: 'dsi-original' }, h(OriginalBrowser, props))
        : h(InboxBoundary, { originalProps: props, onOriginal: () => setMode('original') }, h(react.Fragment, null,
          h('div', { className: 'dsi-controls' },
            h('div', { className: 'dsi-search' },
              h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
                h('circle', { cx: 10.7, cy: 10.7, r: 6.8 }), h('path', { d: 'm16 16 4.5 4.5' })),
              h('input', { type: 'search', placeholder: '搜索会话或项目', 'aria-label': '搜索会话或项目',
                value: query, onChange: event => setQuery(event.target.value) })),
            h('div', { className: `dsi-project-filter${projectId === '*' ? '' : ' dsi-filter-active'}` },
              h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
                h('path', { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' })),
              h('select', { value: projectId, 'aria-label': '筛选项目', onChange: event => setProjectId(event.target.value) },
                h('option', { value: '*' }, '全部项目'),
                ...projects.map(project => h('option', { key: project.workspaceId, value: project.workspaceId }, project.title)),
                h('option', { value: '' }, '未分组'))),
              h(_deepseek_ai_dsh_client_ui_primitives.Menu, {
                open: viewOptionsOpen, onClose: () => setViewOptionsOpen(false), portal: true, align: 'end', dense: true,
                items: [{ id: 'group', label: '按项目分组' }, { id: 'archives', label: '显示原归档' },
                  { type: 'separator', id: 'management' }, { id: 'manage', label: '管理项目' }, { id: 'refresh', label: '刷新会话' }],
                selectedIds: [state.groupByProject && 'group', state.includeArchived && 'archives'].filter(Boolean),
                onSelect: id => {
                  if (id === 'group') update(previous => ({ ...previous, groupByProject: !previous.groupByProject }));
                  if (id === 'archives') update(previous => ({ ...previous, includeArchived: !previous.includeArchived }));
                  if (id === 'manage') setMode('original');
                  if (id === 'refresh') refresh();
                  setViewOptionsOpen(false);
                },
                anchor: h('button', { type: 'button', className: 'dsi-view-options', 'aria-label': '列表显示选项', title: '项目分组与归档显示',
                  'aria-haspopup': 'menu', 'aria-expanded': viewOptionsOpen, onClick: () => setViewOptionsOpen(value => !value) }, '⋯'),
              }),
            projectId !== '*' && h('button', { type: 'button', className: 'dsi-filter-chip', 'aria-label': '清除项目筛选', onClick: () => setProjectId('*') },
              projectId === '' ? '未分组' : projects.find(project => project.workspaceId === projectId)?.title ?? '所选项目', h('span', { 'aria-hidden': true }, '×'))),
          notice && h('div', { role: 'status', className: 'dsi-notice' }, notice,
            undo && h('button', { type: 'button', onClick: () => { restore(undo); setUndo(null); setNotice(null); } }, '撤销')),
          metadataErrors > 0 && h('div', { role: 'status', className: 'dsi-notice' }, `${metadataErrors} 条摘要暂未读到，可点击刷新重试；原聊天仍保留。`),
          h('div', { className: 'dsi-list', role: 'tree', 'aria-label': '按工作状态整理的会话' },
            h('div', { className: 'dsi-open-sections' },
              list.phase !== 'ready' && h('div', { role: 'status', className: 'dsi-empty' }, '正在读取历史会话…'),
              renderSection('working')), renderSection('settled')),
          metadataLoading > 0 && h('div', { className: 'dsi-footnote', role: 'status' }, `正在读取 ${metadataLoading} 条历史摘要…`))));
  }
  return SessionInboxBrowser;
}
