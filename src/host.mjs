import { createRequire } from 'node:module';
import { appendFileSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileAdapter, WORKSPACE_MODULE } from './adapter.mjs';

export const inject = ['clientModules'];

/**
 * One line per boot and per page load, under the system temp directory, only while
 * DSH_SESSION_INBOX_DEBUG is set. The workbench can only be diagnosed from outside by
 * knowing which branch the Host took, and a GUI plugin has nowhere else to say it.
 */
const PROBE = join(tmpdir(), 'dsh-session-inbox-probe.log');
const PROBE_ENABLED = Boolean(process.env.DSH_SESSION_INBOX_DEBUG);
function probe(event, detail = {}) {
  if (!PROBE_ENABLED) return;
  try {
    appendFileSync(PROBE, `${new Date().toISOString()} ${event} ${JSON.stringify(detail)}\n`);
  } catch { /* diagnostics never disturb the Host */ }
}

probe('module-loaded', { pid: process.pid, node: process.versions.node });

export function inboxHostVersion(ctx, entrypoint = process.argv[1]) {
  const release = ctx.clientModules.graph().release;
  if (typeof release?.version === 'string') return release.version;
  // The official Web launcher and Desktop host both directly own app-boot.
  // Resolve from that runtime entrypoint, never from this independently installed plugin.
  const boot = createRequire(realpathSync(entrypoint)).resolve('@deepseek-ai/dsh-app-boot');
  const manifest = JSON.parse(readFileSync(join(dirname(boot), '..', 'package.json'), 'utf8'));
  if (manifest.name !== '@deepseek-ai/dsh-app-boot' || typeof manifest.version !== 'string') {
    throw new Error('Session workbench could not identify the owning DSH runtime.');
  }
  return manifest.version;
}

/** Read the public native module path after the Host has finished booting. */
export function apply(ctx) {
  let template;
  try {
    template = JSON.parse(readFileSync(new URL('./runtime-template.json', import.meta.url), 'utf8'));
  } catch (error) {
    probe('apply-error', { error: String(error) });
    throw error;
  }
  probe('apply', { plugin: template.version, templateBytes: template.client?.length ?? 0 });
  let cached;
  ctx.on('webserver/index-inject', table => {
    let version;
    try { version = inboxHostVersion(ctx); } catch { /* Identity is diagnostic, not an allowlist. */ }
    let result;
    let path;
    try {
      path = ctx.clientModules.clientPath?.(WORKSPACE_MODULE);
      if (!path) throw new Error('native-module-unavailable');
      const stat = statSync(path);
      const key = JSON.stringify([path, stat.size, stat.mtimeMs, stat.ctimeMs, version]);
      if (cached?.key !== key) cached = { key, result: compileAdapter(readFileSync(path, 'utf8'), template, { version }) };
      result = cached.result;
      probe('inject', { version, path, nativeBytes: stat.size, mode: result.mode,
        reason: result.reason, scriptBytes: result.script?.length ?? 0 });
    } catch (error) {
      result = { mode: 'native', reason: 'native-module-unavailable' };
      probe('inject-error', { version, path: path ?? null, error: String(error) });
    }
    table.push({ kind: 'global', name: '__DSH_SESSION_INBOX_HOST__',
      value: { version, mode: result.mode, ...(result.reason ? { reason: result.reason } : {}) } });
    if (result.script) table.push({ kind: 'script', placement: 'head', text: result.script });
  });
}
