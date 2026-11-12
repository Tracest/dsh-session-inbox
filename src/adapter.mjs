import vm from 'node:vm';

export const WORKSPACE_MODULE = '@deepseek-ai/dsh-client-ui-workspace';

const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Canonical text plus a character map back into the source.
 *
 * DSH ships these modules through different bundler settings across releases:
 * 0.2.1 and earlier are readable, 0.2.2-rc.2 is minified to a single line with
 * template literals where there used to be double quotes. Whitespace, comments
 * and the quote character carry no meaning, so anchors are matched against a
 * canonical form and every edit is mapped back to the original bytes. Anything
 * outside an edited span stays byte-identical.
 */
export function normalize(source) {
  const out = [];
  const map = [];
  const push = (ch, at) => { out.push(ch); map.push(at); };
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
        if (quote === '`' && d === '$' && source[j + 1] === '{') { depth++; push('{', j); j += 2; continue; }
        if (quote === '`' && d === '}' && depth > 0) { depth--; push('}', j); j++; continue; }
        if (d === quote && depth === 0) break;
        j++;
      }
      push('"', i);
      for (let k = i + 1; k < j; k++) push(source[k], k);
      push('"', j);
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    push(c, i);
    i++;
  }
  return { text: out.join(''), map };
}

/** FNV-1a over the canonical text: a stable name for a shape, not for bytes. */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `n1-${h.toString(16)}-${text.length}`;
}

/**
 * The native factory text. The Host wraps one registration at the end of the
 * module, so the factory body is the last balanced block before the loader
 * call closes; a forward scan is only needed when that tail convention changes.
 */
function locateFactory(source, normalized) {
  const at = normalized.text.indexOf('factory:');
  if (at < 0) throw new Error('native-factory-missing');
  let start = normalized.map[at] + 'factory:'.length;
  while (start < source.length && /\s/.test(source[start])) start++;

  // Comments are stripped by normalize, so the canonical tail is the loader call
  // even though the bundler appends a sourcemap comment after it.
  if (normalized.text.endsWith('}});')) {
    const close = normalized.map[normalized.text.length - 4];
    if (close !== undefined && close > start) return { start, end: close };
  }
  const end = scanBodyEnd(source, start);
  if (end < 0) throw new Error('native-factory-unbalanced');
  return { start, end };
}

/** Fallback brace matcher; quote aware, tolerant of the shapes seen so far. */
function scanBodyEnd(source, start) {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < source.length && source[i] !== c) { if (source[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

const helperCache = new Map();

/**
 * Compile-time fingerprints must be produced by the same code the browser runs,
 * so the client bridge is the single source of truth for the rule.
 */
function clientFactoryFingerprint(bridgeSource) {
  let helper = helperCache.get(bridgeSource);
  if (!helper) {
    const sandbox = vm.createContext({
      window: { __ModuleLoader__: { load() {} } },
      console,
      document: { querySelector: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} } },
    });
    vm.runInContext(bridgeSource, sandbox);
    helper = vm.runInContext('inboxFactoryFingerprint', sandbox);
    if (typeof helper !== 'function') throw new Error('native-bridge-helper-missing');
    helperCache.set(bridgeSource, helper);
  }
  return helper;
}

/** Build a native factory whose `toString()` is exactly `text`. */
function factoryFrom(text) {
  try {
    const fn = vm.runInNewContext(`(${text})`);
    if (typeof fn !== 'function') throw new Error('not a function');
    return fn;
  } catch {
    throw new Error('native-factory-unbalanced');
  }
}

/** Locate one anchor in canonical space and map it back to the source. */
function anchor(normalized, needle, reason) {
  const parts = normalized.text.split(needle);
  if (parts.length !== 2) throw new Error(reason);
  const start = normalized.text.indexOf(needle);
  return { start, end: start + needle.length, source: normalized.map[start] };
}

/** Guard: the mapped source offset must really sit on the thing we matched. */
function expectAt(source, offset, literal, reason) {
  if (!source.startsWith(literal, offset)) throw new Error(reason);
}

export function compileAdapter(source, template, details = {}) {
  try {
    const whole = normalize(source);
    if (!whole.text.includes(`"${WORKSPACE_MODULE}"`)) throw new Error('native-owner-changed');

    const span = locateFactory(source, whole);
    const factoryText = source.slice(span.start, span.end + 1);
    const nativeFactory = factoryFrom(factoryText);
    const expectFingerprint = clientFactoryFingerprint(template.bridge)(nativeFactory.toString());

    // Anchors are matched on the factory body only: the rest of the module is
    // never copied into the replacement, so it cannot drift out of sync.
    const arrow = normalize(factoryText);
    const openBrace = arrow.text.indexOf('{');
    if (openBrace < 0) throw new Error('native-factory-unbalanced');
    const factoryBody = factoryText.slice(arrow.map[openBrace]);
    const body = normalize(factoryBody);
    const service = anchor(body, 'constworkspaces=ctx.get("workspaces");', 'native-service-anchor-changed');
    const browser = anchor(body, '},WorkspaceBrowser));', 'native-browser-anchor-changed');
    const exportsAnchor = anchor(body, 'exports.apply=apply;', 'native-exports-anchor-changed');
    if (!body.text.includes('functionSessionHoverContent(')) throw new Error('native-view-contract-changed');
    const expanded = body.text.match(/"searchExpanded":"([^"$`]+)"/);
    if (!expanded) throw new Error('native-style-contract-changed');

    // Normalized offsets only mean something once mapped back to real bytes.
    const at = index => body.map[index];
    const edits = [];

    // Extra lifecycle beside the native session catalog. The map points at the
    // next significant character, so the insertion sits after the anchor's `;`.
    const afterService = at(service.end - 1) + 1;
    expectAt(factoryBody, afterService - 1, ';', 'native-service-anchor-changed');
    edits.push([afterService, `
		try {
			inboxInstallShell(ctx);
			queueMicrotask(() => Promise.resolve().then(() => sessions.refresh()).catch(error => {
				window.__DSH_SESSION_INBOX_BRIDGE__.fail('catalog-unavailable');
				console.warn('[dsh-session-inbox] Catalog refresh failed', error);
			}));
		} catch (error) {
			window.__DSH_SESSION_INBOX_BRIDGE__.fail('sidebar-contract-changed');
		}`]);

    // Hand the native browser component to the workbench view.
    const componentAt = at(browser.start + '},'.length);
    expectAt(factoryBody, componentAt, 'WorkspaceBrowser', 'native-browser-anchor-changed');
    const componentEnd = at(browser.start + '},WorkspaceBrowser'.length);
    edits.push([componentAt, 'createInboxBrowser('], [componentEnd, ', ctx)']);

    // The workbench itself, declared immediately before the module exports.
    const exportsAt = at(exportsAnchor.start);
    expectAt(factoryBody, exportsAt, 'exports.apply', 'native-exports-anchor-changed');
    const titleFallback = factoryBody.includes('workspaceDisplayTitle') ? ''
      : 'function workspaceDisplayTitle(title, fallback) { return typeof title === "string" && title.trim() ? title : fallback; }\n';
    edits.push([exportsAt, `${titleFallback}${template.client}\n\t\t`]);

    let adapted = factoryBody;
    for (const [pos, insert] of edits.sort((x, y) => y[0] - x[0])) {
      adapted = adapted.slice(0, pos) + insert + adapted.slice(pos);
    }
    const css = template.css.replaceAll('.dsi-native-search-expanded', '.' + expanded[1]);
    const declarations = `const INBOX_PLUGIN_VERSION=${json(template.version)};
const INBOX_HAS_LEADING_SLOT=${body.text.includes('"sidebar.session.row.leading"')};
const INBOX_CSS=${json(css)};
${template.shared}`;

    // One self-contained factory expression, no nested blocks to reason about.
    const adaptedFactory = `(require) => {${declarations}\n${adapted.slice(1, -1)}\n\t}`;
    factoryFrom(adaptedFactory); // a malformed edit must degrade, never ship
    const script = `${template.bridge}\ninboxInstallBridge(${json(WORKSPACE_MODULE)},${json(expectFingerprint)},${adaptedFactory},${json(details)});\n`;
    // External JS may contain HTML parser state switches, including in tagged
    // templates. Rewriting those could change values; retain native UI instead.
    if (/<\/?script|<!--/i.test(script)) throw new Error('native-inline-format-unsupported');
    new vm.Script(script);
    return { mode: 'adaptive', script, fingerprint: expectFingerprint };
  } catch (error) {
    return { mode: 'native', reason: error.message };
  }
}
