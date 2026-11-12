/** Canonical form of native source: quotes, whitespace and comments carry no
 * meaning, so identity is decided on what the code does, not how it is printed.
 * 0.2.2-rc.2 ships this module minified on one line with template literals where
 * earlier releases use double quotes; both must produce the same canonical text. */
function inboxNormalize(source) {
  const out = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const d = source[j];
        if (d === '\\') { j += 2; continue; }
        if (quote === '`' && d === '$' && source[j + 1] === '{') { depth++; out.push('{'); j += 2; continue; }
        if (quote === '`' && d === '}' && depth > 0) { depth--; out.push('}'); j++; continue; }
        if (d === quote && depth === 0) break;
        j++;
      }
      out.push('"');
      for (let k = i + 1; k < j; k++) out.push(source[k]);
      out.push('"');
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    out.push(c);
    i++;
  }
  return out.join('');
}

function inboxFingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'n1-' + h.toString(16) + '-' + text.length;
}

/** Identity of a factory body. Two releases that keep the same body keep the
 * same fingerprint even if a minifier rewrote every quote and newline. */
function inboxFactoryFingerprint(factoryText) {
  const text = inboxNormalize(factoryText);
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close <= open) throw new Error('native-factory-unbalanced');
  return inboxFingerprint(text.slice(open, close + 1));
}

/** Decorate only a native factory whose shape matches the inspected one. */
function inboxInstallBridge(owner, expectedFingerprint, adaptedFactory, details) {
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
    if (typeof registration.factory !== 'function') {
      state.fail('native-factory-changed');
      return registration;
    }
    let actual;
    try { actual = inboxFactoryFingerprint(registration.factory.toString()); }
    catch (error) { state.fail('native-factory-changed'); return registration; }
    if (actual !== expectedFingerprint) {
      state.fail('native-structure-changed');
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
