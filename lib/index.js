import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

/** Older boot manifests omit the release; publish the owning runtime's version. */
export function apply(ctx) {
  const version = inboxHostVersion(ctx);
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__DSH_SESSION_INBOX_HOST__', value: { version } });
  });
}
