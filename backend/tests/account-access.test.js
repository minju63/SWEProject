import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
test('actual API app exposes health/auth paths while every data domain requires login', async (t) => {
  const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  const child = spawn(process.execPath, ['src/app.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      CULTURE_SYNC_ENABLED: 'false',
      ALARM_JOB_ENABLED: 'false',
      REGISTRATION_CLEANUP_ENABLED: 'false',
      WITHDRAWAL_JOB_ENABLED:'false',
      MY_RESULT_JOB_ENABLED:'false',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('API startup timed out')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('http://localhost:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(Error('API exited ' + code));
    });
  });
  const base = `http://127.0.0.1:${port}/api/v1`;
  assert.equal((await fetch(base + '/health')).status, 200);
  for (const path of [
    '/housing/policies',
    '/policy-catalog',
    '/home',
    '/map/places',
    '/me/workspace',
    '/categories',
  ])
    assert.equal((await fetch(base + path)).status, 401, path);
});
