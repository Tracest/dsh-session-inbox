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

  function highlight(text, query) {
    return inboxHighlight(text, query).map((piece, index) => piece.match
      ? h('mark', { key: index }, piece.text) : piece.text);
  }

  /** Keep the original menu seats and occurrence-local menu hook, rather than copying their actions. */
  function InboxRow({ row, category, currentId, state, clock, query, blocked, native, onOpen, onSettle, onRestore }) {
    const [menuOpen, setMenuOpen] = react.useState(false);
    const menuOpenState = react.useMemo(() => [menuOpen, setMenuOpen], [menuOpen]);
    const pendingText = { approval: '等待审批', question: '等待回答', 'plan-review': '等待审阅' }[row.pending];
    const statusText = row.pending ? pendingText || '等待处理' : row.running ? '正在工作' : row.completionUnread ? '有新结果' : '';
    const detail = [(!state.groupByProject || category !== 'active') && row.projectTitle,
      row.archived && '原生归档', statusText].filter(Boolean).join(' · ');
    const statusClass = row.pending ? ' dsi-waiting' : row.running ? ' dsi-running' : row.completionUnread ? ' dsi-unread' : '';
    const showStatus = Boolean(row.pending || row.running || row.completionUnread);
    const hoverNode = { ...row, completed: row.completionUnread,
      pendingInteraction: row.pending ?? undefined, runningSubagentCount: row.runningSubagentCount };
    const anchor = h('div', { role: 'treeitem', className: `dsi-row${statusClass}${menuOpen ? ' dsi-menu-open' : ''}`,
      'aria-selected': currentId === row.id, 'data-inbox-session-id': row.id, 'data-inbox-category': category,
      onContextMenu: event => { event.preventDefault(); setMenuOpen(true); },
      onKeyDown: event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); event.stopPropagation(); setMenuOpen(true);
        }
      } },
      h('button', { type: 'button', className: 'dsi-open',
        'aria-keyshortcuts': 'Enter Shift+Enter',
        'aria-label': `${row.archived ? '恢复并打开' : '打开会话'}：${row.title}${statusText ? `，${statusText}` : ''}`,
        onClick: () => onOpen(row) },
        h('span', { className: 'dsi-dot', 'aria-hidden': true }, showStatus ? row.pending ? '!' : ''
          : !row.archived && !row.blank && native.renderSlot('sidebar.session.row.leading', { sessionId: row.id })),
        h('span', { className: 'dsi-row-copy' }, h('span', { className: 'dsi-title',
          onDoubleClick: row.blank ? undefined : event => { event.stopPropagation(); native.requestSessionRename(row.id, row.title); } },
          highlight(row.title, query)), detail && h('span', { className: 'dsi-detail' }, highlight(detail, query))),
        row.pinned && h('span', { className: 'dsi-pin', title: '已置顶', 'aria-label': '已置顶' },
          h(_deepseek_ai_dsh_client_ui_primitives.IconPinFillRegular, { size: 11 }))),
      h('span', { className: 'dsi-row-end' },
        h('time', { className: 'dsi-time', title: row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : undefined }, inboxRelativeTime(row.updatedAt, clock)),
        h('span', { className: 'dsi-row-actions' },
          h(_deepseek_ai_dsh_client_ui_primitives.Menu, { open: menuOpen, onClose: () => setMenuOpen(false), portal: true,
            anchor: h('button', { type: 'button', className: 'dsi-icon-button',
              'aria-label': `会话操作：${row.title}`, 'aria-haspopup': 'menu', 'aria-expanded': menuOpen,
              onClick: () => setMenuOpen(value => !value) },
              h(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutlineRegular, { size: 15 })),
            children: native.renderSlot('sidebar.workspaces.session.menu.item', {
              sessionId: row.id, displayTitle: row.title,
            }, { hookContext: menuOpenState }),
          }),
          category === 'settled' ? h('button', { type: 'button', className: 'dsi-row-action',
            'aria-label': `恢复会话：${row.title}`, title: '恢复到上方列表（Shift+Enter）', onClick: () => onRestore(row.id) }, '↶')
            : h('button', { type: 'button', className: 'dsi-row-action', disabled: blocked,
              'aria-label': `Settle：${row.title}`, title: blocked ? '工作或等待回复结束后可整理' : 'Settle：整理到已整理，不删除记录（Shift+Enter）',
              onClick: () => onSettle(row) }, '✓'))));
    return h(_deepseek_ai_dsh_client_ui_primitives.HoverCard, { anchor, openDelayMs: 700, grouped: true, disabled: menuOpen,
      content: h('div', { className: 'dsi-hover' },
        h(SessionHoverContent, { node: hoverNode, now: clock, renderSlot: native.renderSlot, t: native.t }),
        h('div', { className: 'dsi-hover-project' }, row.projectTitle),
        row.path && h('div', { className: 'dsi-hover-path' }, row.path)),
    });
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
    const [returnedAt, setReturnedAt] = react.useState({});
    const [importPreview, setImportPreview] = react.useState(null);
    const [restorePreferences, setRestorePreferences] = react.useState(false);
    const rootRef = react.useRef(null);
    const searchRef = react.useRef(null);
    const importRef = react.useRef(null);
    const previousRunning = react.useRef(new Set());
    const requestedMetadata = react.useRef(new Set());
    const list = props.useSessions(snapshot => snapshot);
    const statuses = props.useSessionStatus(snapshot => snapshot);
    const storedProjects = props.useWorkspaces(snapshot => snapshot.items);
    const archivedIds = props.useWorkspaces(snapshot => snapshot.archivedSessionIds);
    const pinnedIds = props.useWorkspaces(snapshot => snapshot.pinnedSessionIds);
    const panel = props.usePanelInfo(snapshot => snapshot.activePanelId);
    const shortcutState = props.useWorkspaceShortcuts(snapshot => snapshot);
    const lastSearchRequest = react.useRef(shortcutState.searchRequest);
    const projects = react.useMemo(() => storedProjects.map(project => ({ ...project,
      title: workspaceDisplayTitle(project.title, props.t('workspace.defaultName')),
    })), [storedProjects, props.t]);
    const rows = react.useMemo(() => inboxRows(list, projects, statuses, archivedIds, pinnedIds, Object.keys(record.state.settled)),
      [list, projects, statuses, archivedIds, pinnedIds, record.state.settled]);
    const currentId = panel === null ? Object.values(list.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id : undefined;
    const state = record.state;
    const metadataIds = [...new Set([...storedProjects.flatMap(project => project.sessionIds), ...list.ids])].sort();
    const metadataKey = metadataIds.join('|');

    react.useEffect(() => {
      if (lastSearchRequest.current === shortcutState.searchRequest) return;
      lastSearchRequest.current = shortcutState.searchRequest;
      if (state.mode !== 'inbox') return;
      props.expandSidebar();
      requestAnimationFrame(() => searchRef.current?.focus());
    }, [shortcutState.searchRequest, state.mode, props.expandSidebar]);
    react.useEffect(() => {
      // The native directory flow still owns choosing and creating project folders.
      if (state.mode === 'inbox' && shortcutState.addRequested) setMode('original');
    }, [shortcutState.addRequested, state.mode]);

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

    // Pending work returns immediately; only a completed run outside the visible chat becomes unread.
    react.useEffect(() => {
      const returned = rows.filter(row => previousRunning.current.has(row.id) && (!row.running || row.pending));
      previousRunning.current = new Set(rows.filter(row => row.running && !row.pending).map(row => row.id));
      if (returned.length === 0) return;
      const now = Date.now();
      setReturnedAt(previous => ({ ...previous, ...Object.fromEntries(returned.map(row => [row.id, now])) }));
      const unseen = returned.filter(row => !row.running && !row.pending && currentId !== row.id);
      if (unseen.length) update(previous => unseen.reduce((next, row) => inboxComplete(next, row.id, now), previous));
    }, [rows, currentId, update]);
    react.useEffect(() => {
      if (currentId && Object.hasOwn(state.unread, currentId)) update(previous => inboxAcknowledge(previous, currentId));
    }, [currentId, state.unread, update]);

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
      const buttons = [...(rootRef.current?.querySelectorAll('.dsi-open') ?? [])];
      const index = buttons.findIndex(button => button.closest('[data-inbox-session-id]')?.dataset.inboxSessionId === row.id);
      const rowElement = buttons[index]?.closest('[data-inbox-session-id]');
      const hadFocus = rowElement?.contains(document.activeElement);
      const nextId = (buttons[index + 1] ?? buttons[index - 1])?.closest('[data-inbox-session-id]')?.dataset.inboxSessionId;
      if (update(previous => inboxSettle(previous, row))) {
        setUndo(row.id); setNotice(`已整理“${row.title}”，聊天记录仍保留。`);
        if (hadFocus) requestAnimationFrame(() => {
          const next = [...(rootRef.current?.querySelectorAll('[data-inbox-session-id]') ?? [])]
            .find(element => element.dataset.inboxSessionId === nextId)?.querySelector('.dsi-open');
          (next ?? searchRef.current)?.focus();
        });
      }
    };
    const restore = id => {
      const element = [...(rootRef.current?.querySelectorAll('[data-inbox-session-id]') ?? [])]
        .find(row => row.dataset.inboxSessionId === id);
      const hadFocus = element?.contains(document.activeElement);
      if (update(previous => inboxRestore(previous, id))) {
        setReturnedAt(previous => ({ ...previous, [id]: Date.now() }));
        if (hadFocus) requestAnimationFrame(() => {
          const restored = [...(rootRef.current?.querySelectorAll('[data-inbox-session-id]') ?? [])]
            .find(row => row.dataset.inboxSessionId === id)?.querySelector('.dsi-open');
          (restored ?? searchRef.current)?.focus();
        });
      }
    };
    const open = row => {
      if (row.archived) {
        props.unarchiveSession(row.id).then(() => props.open(row.id))
          .catch(error => setNotice(`无法恢复会话：${error.message ?? error}`));
      } else props.open(row.id);
    };
    const visible = inboxFilterRows(rows, query, projectId, state.includeArchived);
    const sections = inboxPartition(visible, state, returnedAt);
    const searching = query.trim().length > 0;
    const refresh = () => {
      requestedMetadata.current.clear();
      setMetadataErrors(0);
      setRefreshEpoch(value => value + 1);
      ctx.sessions.refresh()
        .then(() => setNotice('会话目录已刷新。'))
        .catch(error => setNotice(`会话目录刷新失败：${error.message ?? error}`));
    };

    const exportBackup = () => {
      try {
        const snapshot = inboxParseState(localStorage.getItem(INBOX_STORAGE_KEY));
        const content = inboxExportBackup(snapshot);
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = `dsh-workbench-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setUndo(null); setNotice(`已生成 ${Object.keys(snapshot.settled).length} 条整理记录的备份。`);
      } catch (error) { setNotice(`无法导出备份：${error.message ?? error}`); }
    };
    const readBackup = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (file.size > INBOX_BACKUP_LIMIT) throw new Error('备份文件过大，最多支持 2 MB。');
        const backup = inboxParseBackup(await file.text());
        setRestorePreferences(false); setImportPreview({ ...backup, name: file.name });
      } catch (error) { setUndo(null); setNotice(`无法读取备份：${error.message ?? error}`); }
    };
    const mergeBackup = () => {
      if (!importPreview) return;
      let count = 0;
      if (update(previous => {
        const merged = inboxMergeBackup(previous, importPreview, rows, restorePreferences);
        count = Object.keys(merged.settled).length;
        return merged;
      })) {
        setImportPreview(null); setUndo(null);
        setNotice(`备份已合并，保留 ${count} 条整理记录；聊天和原生归档保持原样。`);
      }
    };

    // Scoped to this list: leave chat editing, native menus, dialogs and global shortcuts alone.
    const onListKeyDown = event => {
      if (!rootRef.current?.contains(event.target) || event.defaultPrevented || event.nativeEvent.isComposing
          || event.metaKey || event.ctrlKey || event.altKey || event.target.tagName === 'SELECT') return;
      const onSearch = event.target === searchRef.current;
      const rowElement = event.target.closest('[data-inbox-session-id]');
      if (!onSearch && !rowElement) return;
      if (rowElement && event.key === 'Enter' && event.shiftKey && event.target.classList.contains('dsi-open')) {
        event.preventDefault(); event.stopPropagation();
        const row = rows.find(item => item.id === rowElement.dataset.inboxSessionId);
        if (!row) return;
        if (inboxCategory(row, state) === 'settled') restore(row.id);
        else if (!row.running && !row.pending && !row.blank && !record.error) settle(row);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (query) setQuery('');
        searchRef.current?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (onSearch && (event.key === 'Home' || event.key === 'End')) return;
      const buttons = [...rootRef.current.querySelectorAll('.dsi-open')];
      if (buttons.length === 0) return;
      const index = buttons.findIndex(button => button.closest('[data-inbox-session-id]') === rowElement);
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else if (onSearch) next = event.key === 'ArrowDown' ? 0 : buttons.length - 1;
      else next = Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      event.preventDefault(); event.stopPropagation();
      buttons[next].focus(); buttons[next].scrollIntoView({ block: 'nearest' });
    };

    function renderRow(row, category) {
      const presented = { ...row, completionUnread: currentId !== row.id && (row.completionUnread || Object.hasOwn(state.unread, row.id)) };
      return h(InboxRow, { key: row.id, row: presented, category, currentId, state, clock, query, native: props,
        blocked: row.blank || row.running || Boolean(row.pending) || Boolean(record.error),
        onOpen: open, onSettle: settle, onRestore: restore });
    }

    function renderMembers(category) {
      const members = sections[category];
      if (!state.groupByProject || category !== 'active') {
        return h('div', { role: 'group' }, members.map(row => renderRow(row, category)));
      }
      const groups = new Map();
      for (const row of members) {
        const key = row.projectId;
        if (!groups.has(key)) groups.set(key, { title: row.projectTitle, rows: [] });
        groups.get(key).rows.push(row);
      }
      return [...groups].map(([key, group]) => {
        const groupKey = `${category}:${key}`;
        const closed = inboxViewCollapsed(state, category, query, key);
        return h('div', { key, className: 'dsi-project', 'data-inbox-project': key },
          h('button', { type: 'button', className: 'dsi-project-head', 'aria-expanded': !closed, disabled: searching,
            title: searching ? '搜索时自动展开，清空后恢复原来的折叠状态' : undefined,
            onClick: () => update(previous => ({ ...previous,
              collapsed: { ...previous.collapsed, [groupKey]: !inboxCollapsed(previous, category, key) },
            })) }, `${closed ? '›' : '⌄'}  `, highlight(group.title, query), h('span', { className: 'dsi-count' }, group.rows.length)),
          !closed && h('div', { role: 'group' }, group.rows.map(row => renderRow(row, category))));
      });
    }

    function renderShelf(category) {
      const members = sections[category];
      if (category === 'working' && members.length === 0) return null;
      const collapsed = inboxViewCollapsed(state, category, query);
      return h('section', { key: category, className: `dsi-section dsi-${category}${members.length ? '' : ' dsi-section-empty'}`, 'data-inbox-section': category },
        h('div', { className: 'dsi-section-heading' }, h('button', { type: 'button', className: 'dsi-section-head', 'aria-expanded': !collapsed, disabled: searching,
          title: searching ? '搜索时自动展开，清空后恢复原来的折叠状态' : undefined,
          'aria-label': `${labels[category]} ${members.length}`, onClick: () => toggleCollapsed(category === 'working' ? 'running' : category) },
          h('span', { 'aria-hidden': true }, collapsed ? '›' : '⌄'),
          h('span', null, labels[category]), h('span', { className: 'dsi-count' }, members.length))),
        !collapsed && h('div', { className: 'dsi-section-body' }, members.length === 0
          ? h('div', { className: 'dsi-empty' }, query.trim() ? '没有匹配的会话' : '点会话右侧 ✓ 即可整理')
          : renderMembers(category)));
    }

    return h('div', { ref: rootRef, className: 'dsi-root', onKeyDown: onListKeyDown, 'data-session-inbox-version': INBOX_PLUGIN_VERSION,
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
              h('input', { ref: searchRef, type: 'search', placeholder: '搜索会话或项目', 'aria-label': '搜索会话或项目',
                title: '↑ ↓ 选择会话，Enter 打开，Shift+Enter 整理或恢复，Esc 清除搜索',
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
                  { type: 'separator', id: 'management' }, { id: 'manage', label: '管理项目' }, { id: 'refresh', label: '刷新会话' },
                  { type: 'separator', id: 'backup' }, { id: 'export', label: '导出整理备份…' }, { id: 'import', label: '恢复整理备份…' }],
                selectedIds: [state.groupByProject && 'group', state.includeArchived && 'archives'].filter(Boolean),
                onSelect: id => {
                  if (id === 'group') update(previous => ({ ...previous, groupByProject: !previous.groupByProject }));
                  if (id === 'archives') update(previous => ({ ...previous, includeArchived: !previous.includeArchived }));
                  if (id === 'manage') setMode('original');
                  if (id === 'refresh') refresh();
                  if (id === 'export') exportBackup();
                  if (id === 'import') importRef.current?.click();
                  setViewOptionsOpen(false);
                },
                anchor: h('button', { type: 'button', className: 'dsi-view-options', 'aria-label': '列表显示选项', title: '项目分组与归档显示',
                  'aria-haspopup': 'menu', 'aria-expanded': viewOptionsOpen, onClick: () => setViewOptionsOpen(value => !value) }, '⋯'),
              }),
            h('button', { type: 'button', className: 'dsi-original-toggle', 'aria-label': '一键切回原布局',
              title: '一键恢复 DSH 原布局，保留聊天和整理记录', onClick: () => setMode('original') }, '原布局'),
            projectId !== '*' && h('button', { type: 'button', className: 'dsi-filter-chip', 'aria-label': '清除项目筛选', onClick: () => setProjectId('*') },
              projectId === '' ? '未分组' : projects.find(project => project.workspaceId === projectId)?.title ?? '所选项目', h('span', { 'aria-hidden': true }, '×'))),
          h('input', { ref: importRef, type: 'file', accept: '.json,application/json', hidden: true, onChange: readBackup,
            'aria-label': '选择整理备份文件' }),
          searching && h('div', { className: 'dsi-search-summary', role: 'status' }, `找到 ${visible.length} 个会话`,
            h('button', { type: 'button', onClick: () => { setQuery(''); searchRef.current?.focus(); }, 'aria-label': '清除搜索' }, '清除')),
          notice && h('div', { role: 'status', className: 'dsi-notice' }, notice,
            undo && h('button', { type: 'button', onClick: () => { restore(undo); setUndo(null); setNotice(null); } }, '撤销')),
          metadataErrors > 0 && h('div', { role: 'status', className: 'dsi-notice' }, `${metadataErrors} 条摘要暂未读到，可点击刷新重试；原聊天仍保留。`),
          h(_deepseek_ai_dsh_client_ui_primitives.HoverCardGroup, { className: 'dsi-hover-group' },
            h('div', { className: `dsi-list${searching ? ' dsi-list-search' : ''}`, role: 'tree', 'aria-label': '按工作状态整理的会话' },
            (!searching || sections.active.length > 0 || visible.length === 0 || list.phase !== 'ready') && h('div', { className: 'dsi-inbox', role: 'group', 'aria-label': '待查看会话', 'data-inbox-section': 'active' },
              list.phase !== 'ready' && h('div', { role: 'status', className: 'dsi-empty' }, '正在读取历史会话…'),
              renderMembers('active'),
              visible.length === 0 && list.phase === 'ready' && h('div', { className: 'dsi-empty' }, query.trim() ? '没有匹配的会话' : '点顶部按钮开始新会话')),
            h('div', { className: 'dsi-shelves' }, renderShelf('working'), renderShelf('settled')))),
          metadataLoading > 0 && h('div', { className: 'dsi-footnote', role: 'status' }, `正在读取 ${metadataLoading} 条历史摘要…`),
          importPreview && h(_deepseek_ai_dsh_client_ui_primitives.Modal, { open: true, onClose: () => setImportPreview(null),
            closeLabel: '关闭', title: '恢复整理备份',
            footer: h(react.Fragment, null,
              h(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: 'outline', onClick: () => setImportPreview(null) }, '取消'),
              h(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: 'primary', onClick: mergeBackup }, '合并恢复')),
          }, h('div', { className: 'dsi-backup-preview' },
            h('p', { className: 'dsi-backup-filename' }, importPreview.name),
            h('p', null, `备份包含 ${Object.keys(importPreview.state.settled).length} 条整理记录，当前保留 ${Object.keys(state.settled).length} 条。`),
            h('p', null, `备份时间：${new Date(importPreview.exportedAt).toLocaleString('zh-CN')}`),
            h('p', null, '合并时保留现有记录；有新活动或正在运行的会话仍会显示。不会导入、删除或改写聊天。'),
            h('label', { className: 'dsi-backup-preference' },
              h('input', { type: 'checkbox', checked: restorePreferences, onChange: event => setRestorePreferences(event.target.checked) }),
              '同时恢复项目分组、归档显示和折叠偏好'))))));
  }
  return SessionInboxBrowser;
}
