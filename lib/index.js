import { createRequire } from 'node:module';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compileAdapter, WORKSPACE_MODULE } from './adapter.mjs';

export const inject = ['clientModules'];

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
  const template = JSON.parse(readFileSync(new URL('./runtime-template.json', import.meta.url), 'utf8'));
  let cached;
  ctx.on('webserver/index-inject', table => {
    let version;
    try { version = inboxHostVersion(ctx); } catch { /* Identity is diagnostic, not an allowlist. */ }
    let result;
    try {
      const path = ctx.clientModules.clientPath?.(WORKSPACE_MODULE);
      if (!path) throw new Error('native-module-unavailable');
      const stat = statSync(path);
      const key = JSON.stringify([path, stat.size, stat.mtimeMs, stat.ctimeMs, version]);
      if (cached?.key !== key) cached = { key, result: compileAdapter(readFileSync(path, 'utf8'), template, { version }) };
      result = cached.result;
    } catch {
      result = { mode: 'native', reason: 'native-module-unavailable' };
    }
    table.push({ kind: 'global', name: '__DSH_SESSION_INBOX_HOST__',
      value: { version, mode: result.mode, ...(result.reason ? { reason: result.reason } : {}) } });
    if (result.script) table.push({ kind: 'script', placement: 'head', text: result.script });
  });
}
