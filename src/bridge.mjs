/** Decorate only the exact native factory inspected by this Host. */
function inboxInstallBridge(owner, expectedFactory, adaptedFactory, details) {
  const loader = window.__ModuleLoader__;
  const listeners = new Set();
  let active = 0;
  let fault;
  let suspended = false;
  let originalDescriptor;
  let currentLoad;
  let wrappedLoad;
  let getLoad;
  let setLoad;
  function notify() {
    for (const listener of [...listeners]) {
      try { listener(); } catch (error) { console.warn('[dsh-session-inbox] Observer failed', error); }
    }
  }
  const state = {
    details,
    get enabled() { return active > 0 && !fault; },
    get reason() { return fault; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    fail(reason) {
      if (fault) return;
      fault = reason;
      restore();
      notify();
      console.warn('[dsh-session-inbox] Native list retained:', reason);
    },
    activate() {
      active++;
      suspended = false;
      install();
      notify();
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        active--;
        if (active === 0) restore();
        notify();
      };
    },
  };
  window.__DSH_SESSION_INBOX_BRIDGE__ = state;
  const decorated = new WeakSet();
  function decorate(registration) {
    if (suspended || fault || registration?.id !== owner || decorated.has(registration)) return registration;
    if (typeof registration.factory !== 'function'
      || registration.factory.toString().replace(/\r\n/g, '\n') !== expectedFactory) {
      state.fail('native-factory-changed');
      return registration;
    }
    const original = registration.factory;
    const replacement = { ...registration, factory(require) {
      if (fault || suspended) return original(require);
      try { return adaptedFactory(require); }
      catch (error) {
        state.fail('native-factory-unavailable');
        return original(require);
      }
    } };
    decorated.add(replacement);
    return replacement;
  }
  function restore() {
    suspended = true;
    const descriptor = loader && Object.getOwnPropertyDescriptor(loader, 'load');
    if (getLoad && descriptor?.get === getLoad && descriptor?.set === setLoad) {
      Object.defineProperty(loader, 'load', { ...originalDescriptor, value: currentLoad });
    }
  }
  function install() {
    if (fault) return;
    if (typeof loader?.load !== 'function') { state.fail('module-loader-unavailable'); return; }
    const descriptor = Object.getOwnPropertyDescriptor(loader, 'load');
    if (getLoad && descriptor?.get === getLoad && descriptor?.set === setLoad) return;
    if (descriptor && (!descriptor.configurable || !('value' in descriptor) || !descriptor.writable)) {
      state.fail('module-loader-contract-changed'); return;
    }
    originalDescriptor = descriptor ?? { configurable: true, enumerable: true, writable: true };
    const wrap = next => function (registration) { return Reflect.apply(next, this, [decorate(registration)]); };
    currentLoad = loader.load;
    wrappedLoad = wrap(currentLoad);
    getLoad = () => wrappedLoad;
    setLoad = next => {
      currentLoad = next;
      if (typeof next !== 'function') { state.fail('module-loader-contract-changed'); return; }
      wrappedLoad = wrap(next);
    };
    // DSH replaces the parser's queue facade with its live loader during boot.
    // Preserve that assignment and decorate its current target, never a stale queue.
    Object.defineProperty(loader, 'load', { configurable: true, enumerable: originalDescriptor.enumerable, get: getLoad, set: setLoad });
    if (Array.isArray(loader.pendingQueue)) {
      for (let i = 0; i < loader.pendingQueue.length; i++) loader.pendingQueue[i] = decorate(loader.pendingQueue[i]);
    }
  }
  install();
}
