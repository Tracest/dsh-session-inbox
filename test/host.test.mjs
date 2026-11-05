import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply, inboxHostVersion } from '../src/host.mjs';

test('host bootstrap uses its current release and publishes an owned global', () => {
  let listener;
  const ctx = { clientModules: { graph: () => ({ release: { version: '0.2.2-rc.1' } }) },
    on(event, callback) { assert.equal(event, 'webserver/index-inject'); listener = callback; } };
  assert.equal(inboxHostVersion(ctx, '/must-not-access'), '0.2.2-rc.1');
  apply(ctx);
  const table = [{ kind: 'global', name: 'another-plugin', value: true }];
  listener(table);
  assert.equal(table[0].name, 'another-plugin');
  assert.deepEqual(table[1], { kind: 'global', name: '__DSH_SESSION_INBOX_HOST__', value: { version: '0.2.2-rc.1' } });
});

test('old hosts resolve app-boot from the real launcher owner across a directory link', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-inbox-host-test-'));
  try {
    const owner = path.join(root, 'owner');
    const launcher = path.join(owner, 'dsh', 'lib');
    const boot = path.join(owner, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
    fs.mkdirSync(launcher, { recursive: true });
    fs.mkdirSync(path.join(boot, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(launcher, 'bin.js'), '');
    fs.writeFileSync(path.join(boot, 'lib', 'index.js'), '');
    fs.writeFileSync(path.join(boot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.1.7-rc.2', main: 'lib/index.js' }));
    const link = path.join(root, 'linked-launcher');
    fs.symlinkSync(path.join(owner, 'dsh'), link, process.platform === 'win32' ? 'junction' : 'dir');
    const ctx = { clientModules: { graph: () => ({}) } };
    assert.equal(inboxHostVersion(ctx, path.join(link, 'lib', 'bin.js')), '0.1.7-rc.2');
    fs.writeFileSync(path.join(boot, 'package.json'), JSON.stringify({ name: 'different-owner', version: '0.1.7-rc.2', main: 'lib/index.js' }));
    assert.throws(() => inboxHostVersion(ctx, path.join(link, 'lib', 'bin.js')), /owning DSH runtime/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
