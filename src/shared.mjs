/** Keep the sidebar shell and list in sync without changing DSH's navigation or draft state. */
const INBOX_STATE_EVENT = 'dsh-session-inbox:change';
let inboxModeOverride;

function inboxPublishMode(mode) {
  inboxModeOverride = mode;
  window.dispatchEvent(new Event(INBOX_STATE_EVENT));
}

function inboxReadModeSnapshot() {
  if (inboxModeOverride !== undefined) return inboxModeOverride;
  try { return inboxParseState(localStorage.getItem(INBOX_STORAGE_KEY)).mode; }
  catch { return 'inbox'; }
}

function inboxSubscribeMode(listener) {
  const onStorage = event => {
    if (event.key !== INBOX_STORAGE_KEY) return;
    inboxModeOverride = undefined;
    listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(INBOX_STATE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(INBOX_STATE_EVENT, listener);
  };
}
