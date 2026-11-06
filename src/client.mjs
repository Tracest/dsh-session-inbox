/** Enhance the current native workspace while retaining its props and child slots. */
function createInboxBrowser(OriginalBrowser, ctx) {
  try { return inboxCreateBrowser(OriginalBrowser, ctx); }
  catch (error) {
    window.__DSH_SESSION_INBOX_BRIDGE__?.fail('browser-construction-unavailable');
    console.warn('[dsh-session-inbox] Native browser retained', error);
    return OriginalBrowser;
  }
}

function inboxBrowserCapabilities(props, ctx) {
  const required = ['useSessions', 'useSessionStatus', 'useWorkspaces', 'usePanelInfo',
    'open', 't', 'renderSlot', 'requestSessionRename', 'unarchiveSession'];
  if (props.useContextMenu != null) required.push('useContextMenu', 'useContextMenuTarget', 'useSessionAccess', 'openSessionMenu');
  if (props.useWorkspaceShortcuts != null) required.push('useWorkspaceShortcuts', 'expandSidebar');
  if (props.useSessionAccess != null) required.push('useSessionAccess');
  return required.every(name => typeof props[name] === 'function')
    && ['refresh', 'refreshProjections'].every(name => typeof ctx.sessions?.[name] === 'function');
}

function inboxRunNative(action, onError) {
  const failed = error => {
    window.__DSH_SESSION_INBOX_BRIDGE__?.fail('browser-action-unavailable');
    console.warn('[dsh-session-inbox] Native action unavailable', error);
    onError?.(error);
  };
  try {
    const result = action();
    Promise.resolve(result).catch(failed);
    return result;
  } catch (error) { failed(error); }
}

function inboxCreateBrowser(OriginalBrowser, ctx) {
  const h = react.createElement;
  const labels = { working: '工作中', settled: '已整理' };

  /** One quiet, rounded outline set for the workbench's own controls. */
  function InboxIcon({ name }) {
    const paths = {
      check: 'm5 12 4.5 4.5L19 7',
      restore: 'm9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12',
      search: 'm16.5 16.5 4 4',
      folder: 'M3 7.5V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z',
      close: 'm6 6 12 12M18 6 6 18',
      chevronRight: 'm9 6 6 6-6 6',
      chevronDown: 'm6 9 6 6 6-6',
      pin: 'm15 3 6 6-4 1-3 5v4l-9-9h4l5-3 1-4ZM9 15l-5 5',
    };
    return h('svg', { className: 'dsi-icon', 'data-inbox-icon': name, width: 16, height: 16,
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false },
      name === 'more' ? [6, 12, 18].map(cx => h('circle', { key: cx, cx, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }))
        : h('path', { d: paths[name] }),
      name === 'search' && h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }));
  }

  /** Transient feedback never takes space away from the session list. */
  function InboxToast({ notice, onDismiss, onUndo }) {
    const [hovered, setHovered] = react.useState(false);
    const [focused, setFocused] = react.useState(false);
    const [closing, setClosing] = react.useState(false);
    const remaining = react.useRef(5000);
    const paused = hovered || focused;
    react.useEffect(() => {
      remaining.current = 5000;
      setClosing(false);
    }, [notice]);
    react.useEffect(() => {
      if (paused || closing) return;
      const started = performance.now();
      const timer = setTimeout(() => setClosing(true), remaining.current);
      return () => {
        clearTimeout(timer);
        remaining.current = Math.max(0, remaining.current - (performance.now() - started));
      };
    }, [notice, paused, closing]);
    react.useEffect(() => {
      if (!closing) return;
      const timer = setTimeout(onDismiss, 160);
      return () => clearTimeout(timer);
    }, [notice, closing, onDismiss]);
    return h('div', { className: `dsi-toast${closing ? ' dsi-toast-closing' : ''}`, role: 'status',
      'aria-atomic': true, title: notice.label,
      onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); },
      onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); } } },
      notice.undoId && h(InboxIcon, { name: 'check' }),
      h('span', { className: 'dsi-toast-message' }, notice.message),
      notice.undoId && h('button', { type: 'button', className: 'dsi-toast-undo', onClick: onUndo }, '撤销'),
      h('button', { type: 'button', className: 'dsi-toast-close', 'aria-label': '关闭通知', onClick: onDismiss }, h(InboxIcon, { name: 'close' })));
  }

  class InboxBoundary extends react.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) {
      window.__DSH_SESSION_INBOX_BRIDGE__?.fail('browser-contract-changed');
      console.warn('[dsh-session-inbox] Original list fallback:', error);
    }
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

  /** Each host keeps its own menu service and permission hooks. */
  function InboxRow(props) {
    return h(props.native.useContextMenu ? UnifiedInboxRow : LegacyInboxRow, props);
  }

  function UnifiedInboxRow(props) {
    const { native, row } = props;
    const { getTriggerProps } = native.useContextMenu();
    const menuOpen = native.useContextMenuTarget(target => target?.kind === 'session' && target.value.sessionId === row.id);
    const renamable = native.useSessionAccess(row.id, 'session/rename');
    return renderInboxRow(props, { menuOpen, renamable,
      trigger: getTriggerProps(row.blank ? undefined : { kind: 'session', value: { sessionId: row.id, displayTitle: row.title } }),
      wrap: button => button,
      open: event => {
        event.currentTarget.focus({ preventScroll: true });
        const rect = event.currentTarget.getBoundingClientRect();
        inboxRunNative(() => native.openSessionMenu(row.id, row.title, { x: rect.left, y: rect.bottom }, 'toggle'));
      } });
  }

  function LegacyInboxRow(props) {
    const { native, row } = props;
    const [menuOpen, setMenuOpen] = react.useState(false);
    const menuOpenState = react.useMemo(() => [menuOpen, setMenuOpen], [menuOpen]);
    const renamable = native.useSessionAccess ? native.useSessionAccess(row.id, 'session/rename') : true;
    const openMenu = event => {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.querySelector('.dsi-icon-button')?.focus({ preventScroll: true });
      setMenuOpen(true);
    };
    return renderInboxRow(props, { menuOpen, renamable,
      trigger: row.blank ? {} : { tabIndex: 0, onContextMenu: openMenu,
        onKeyDown: event => {
          if (event.key === 'Escape' && menuOpen) {
            event.preventDefault(); event.stopPropagation(); setMenuOpen(false);
          } else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') openMenu(event);
        } },
      open: event => { event.currentTarget.focus({ preventScroll: true }); setMenuOpen(value => !value); },
      wrap: button => h(_deepseek_ai_dsh_client_ui_primitives.Menu, {
        open: menuOpen, onClose: () => setMenuOpen(false), portal: true, closeOnPointerLeave: true, anchor: button,
      }, native.renderSlot('sidebar.workspaces.session.menu.item', { sessionId: row.id, displayTitle: row.title }, { hookContext: menuOpenState })) });
  }

  function renderInboxRow({ row, category, currentId, state, clock, query, blocked, native, onOpen, onSettle, onRestore }, menu) {
    const { menuOpen, renamable } = menu;
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
      ...menu.trigger },
      h('button', { type: 'button', className: 'dsi-open',
        'aria-keyshortcuts': 'Enter Shift+Enter',
        'aria-label': `${row.archived ? '恢复并打开' : '打开会话'}：${row.title}${statusText ? `，${statusText}` : ''}`,
        onClick: () => onOpen(row) },
        h('span', { className: 'dsi-dot', 'aria-hidden': true }, showStatus ? row.pending ? '!' : ''
          : INBOX_HAS_LEADING_SLOT && !row.archived && !row.blank && native.renderSlot('sidebar.session.row.leading', { sessionId: row.id })),
        h('span', { className: 'dsi-row-copy' }, h('span', { className: 'dsi-title',
          onDoubleClick: row.blank || !renamable ? undefined : event => { event.stopPropagation(); inboxRunNative(() => native.requestSessionRename(row.id, row.title)); } },
          highlight(row.title, query)), detail && h('span', { className: 'dsi-detail' }, highlight(detail, query))),
        row.pinned && h('span', { className: 'dsi-pin', title: '已置顶', 'aria-label': '已置顶' },
          h(InboxIcon, { name: 'pin' }))),
      h('span', { className: 'dsi-row-end' },
        h('time', { className: 'dsi-time', title: row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : undefined }, inboxRelativeTime(row.updatedAt, clock)),
        h('span', { className: 'dsi-row-actions' },
          menu.wrap(h('button', { type: 'button', className: 'dsi-icon-button', disabled: row.blank,
              'aria-label': `会话操作：${row.title}`, 'aria-haspopup': 'menu', 'aria-expanded': menuOpen,
              'data-context-menu-trigger': '', onPointerDown: event => event.stopPropagation(),
              onClick: menu.open }, h(InboxIcon, { name: 'more' }))),
          category === 'settled' ? h('button', { type: 'button', className: 'dsi-row-action',
            'aria-label': `恢复会话：${row.title}`, title: '恢复到上方列表（Shift+Enter）', onClick: () => onRestore(row.id) }, h(InboxIcon, { name: 'restore' }))
            : h('button', { type: 'button', className: 'dsi-row-action', disabled: blocked,
              'aria-label': `Settle：${row.title}`, title: blocked ? '工作或等待回复结束后可整理' : 'Settle：整理到已整理，不删除记录（Shift+Enter）',
              onClick: () => onSettle(row) }, h(InboxIcon, { name: 'check' })))));
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
    const showNotice = react.useCallback((message, undoId = null, label = message) => setNotice({ message, undoId, label }), []);
    const dismissNotice = react.useCallback(() => setNotice(null), []);
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
    const shortcutState = props.useWorkspaceShortcuts
      ? props.useWorkspaceShortcuts(snapshot => snapshot) : { searchRequest: 0, addRequested: false };
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
      inboxRunNative(() => props.expandSidebar());
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
      run().catch(error => { if (!cancelled) showNotice(`历史摘要读取失败：${error.message ?? error}`); });
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
        showNotice('已整理', row.id, `已整理“${row.title}”`);
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
      const restored = update(previous => inboxRestore(previous, id));
      if (restored) {
        setReturnedAt(previous => ({ ...previous, [id]: Date.now() }));
        if (hadFocus) requestAnimationFrame(() => {
          const restored = [...(rootRef.current?.querySelectorAll('[data-inbox-session-id]') ?? [])]
            .find(row => row.dataset.inboxSessionId === id)?.querySelector('.dsi-open');
          (restored ?? searchRef.current)?.focus();
        });
      }
      return restored;
    };
    const undoNotice = () => {
      const id = notice?.undoId;
      if (!id || !restore(id)) return;
      dismissNotice();
      requestAnimationFrame(() => {
        const restored = [...(rootRef.current?.querySelectorAll('[data-inbox-session-id]') ?? [])]
          .find(row => row.dataset.inboxSessionId === id)?.querySelector('.dsi-open');
        (restored ?? searchRef.current)?.focus();
      });
    };
    const open = row => {
      inboxRunNative(() => row.archived
        ? Promise.resolve(props.unarchiveSession(row.id)).then(() => props.open(row.id))
        : props.open(row.id), error => showNotice(`无法打开会话：${error.message ?? error}`));
    };
    const visible = inboxFilterRows(rows, query, projectId, state.includeArchived);
    const sections = inboxPartition(visible, state, returnedAt);
    const searching = query.trim().length > 0;
    const refresh = () => {
      requestedMetadata.current.clear();
      setMetadataErrors(0);
      setRefreshEpoch(value => value + 1);
      inboxRunNative(() => Promise.resolve(ctx.sessions.refresh()).then(() => showNotice('会话目录已刷新。')),
        error => showNotice(`会话目录刷新失败：${error.message ?? error}`));
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
        showNotice(`已生成 ${Object.keys(snapshot.settled).length} 条整理记录的备份。`);
      } catch (error) { showNotice(`无法导出备份：${error.message ?? error}`); }
    };
    const readBackup = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (file.size > INBOX_BACKUP_LIMIT) throw new Error('备份文件过大，最多支持 2 MB。');
        const backup = inboxParseBackup(await file.text());
        setRestorePreferences(false); setImportPreview({ ...backup, name: file.name });
      } catch (error) { showNotice(`无法读取备份：${error.message ?? error}`); }
    };
    const mergeBackup = () => {
      if (!importPreview) return;
      let count = 0;
      if (update(previous => {
        const merged = inboxMergeBackup(previous, importPreview, rows, restorePreferences);
        count = Object.keys(merged.settled).length;
        return merged;
      })) {
        setImportPreview(null);
        showNotice(`备份已合并，保留 ${count} 条整理记录；聊天和原生归档保持原样。`);
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
            })) }, h(InboxIcon, { name: closed ? 'chevronRight' : 'chevronDown' }), highlight(group.title, query), h('span', { className: 'dsi-count' }, group.rows.length)),
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
          h(InboxIcon, { name: collapsed ? 'chevronRight' : 'chevronDown' }),
          h('span', null, labels[category]), h('span', { className: 'dsi-count' }, members.length))),
        !collapsed && h('div', { className: 'dsi-section-body' }, members.length === 0
          ? h('div', { className: 'dsi-empty' }, query.trim() ? '没有匹配的会话' : '点会话右侧的勾选按钮即可整理')
          : renderMembers(category)));
    }

    return h('div', { ref: rootRef, className: state.mode === 'original' ? 'dsi-native-root' : 'dsi-root', onKeyDown: onListKeyDown, 'data-session-inbox-version': INBOX_PLUGIN_VERSION,
      'data-inbox-catalog-count': list.ids.length, 'data-inbox-summary-count': Object.keys(list.byId).length },
      state.mode === 'original' && h('button', { type: 'button', className: 'dsi-native-return',
        onClick: () => setMode('inbox'), 'aria-label': '切到会话工作台', title: '返回会话工作台，保留聊天和整理记录' }, '切到工作台'),
      record.error && h('div', { role: 'alert', className: 'dsi-notice' }, record.error),
      state.mode === 'original' ? h('div', { className: 'dsi-original' }, h(OriginalBrowser, props))
        : h(InboxBoundary, { originalProps: props, onOriginal: () => setMode('original') }, h(react.Fragment, null,
          h('div', { className: 'dsi-controls' },
            h('div', { className: 'dsi-search' },
              h(InboxIcon, { name: 'search' }),
              h('input', { ref: searchRef, type: 'search', placeholder: '搜索会话或项目', 'aria-label': '搜索会话或项目',
                title: '↑ ↓ 选择会话，Enter 打开，Shift+Enter 整理或恢复，Esc 清除搜索',
                value: query, onChange: event => setQuery(event.target.value) })),
            h('div', { className: `dsi-project-filter${projectId === '*' ? '' : ' dsi-filter-active'}` },
              h(InboxIcon, { name: 'folder' }),
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
                  'aria-haspopup': 'menu', 'aria-expanded': viewOptionsOpen, onClick: () => setViewOptionsOpen(value => !value) }, h(InboxIcon, { name: 'more' })),
              }),
            h('button', { type: 'button', className: 'dsi-original-toggle', 'aria-label': '一键切回原布局',
              title: '一键恢复 DSH 原布局，保留聊天和整理记录', onClick: () => setMode('original') }, '原布局'),
            projectId !== '*' && h('button', { type: 'button', className: 'dsi-filter-chip', 'aria-label': '清除项目筛选', onClick: () => setProjectId('*') },
              projectId === '' ? '未分组' : projects.find(project => project.workspaceId === projectId)?.title ?? '所选项目', h(InboxIcon, { name: 'close' }))),
          h('input', { ref: importRef, type: 'file', accept: '.json,application/json', hidden: true, onChange: readBackup,
            'aria-label': '选择整理备份文件' }),
          searching && h('div', { className: 'dsi-search-summary', role: 'status' }, `找到 ${visible.length} 个会话`,
            h('button', { type: 'button', onClick: () => { setQuery(''); searchRef.current?.focus(); }, 'aria-label': '清除搜索' }, '清除')),
          metadataErrors > 0 && h('div', { role: 'status', className: 'dsi-notice' }, `${metadataErrors} 条摘要暂未读到，可点击刷新重试；原聊天仍保留。`),
          h(_deepseek_ai_dsh_client_ui_primitives.HoverCardGroup ?? 'div', { className: 'dsi-hover-group' },
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
              '同时恢复项目分组、归档显示和折叠偏好'))))),
      h('div', { className: 'dsi-toast-host', 'aria-live': 'polite' },
        notice && h(InboxToast, { notice, onDismiss: dismissNotice, onUndo: undoNotice })));
  }
  class AdaptiveBoundary extends react.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { window.__DSH_SESSION_INBOX_BRIDGE__?.fail('browser-contract-changed'); }
    render() { return this.state.failed ? h(OriginalBrowser, this.props.nativeProps) : this.props.children; }
  }
  return function AdaptiveBrowser(props) {
    const bridge = window.__DSH_SESSION_INBOX_BRIDGE__;
    const [, refresh] = react.useState(0);
    react.useEffect(() => {
      const unsubscribe = bridge?.subscribe(() => refresh(value => value + 1));
      refresh(value => value + 1); // Account for activation between render and subscription.
      return unsubscribe;
    }, [bridge]);
    const available = inboxBrowserCapabilities(props, ctx);
    react.useEffect(() => { if (!available) bridge?.fail('browser-hooks-unavailable'); }, [available, bridge]);
    if (bridge?.enabled === false || !available) return h(OriginalBrowser, props);
    return h(AdaptiveBoundary, { nativeProps: props }, h(SessionInboxBrowser, props));
  };
}
