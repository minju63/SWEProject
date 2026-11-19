import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileRegistrationState } from '../src/services/registration-file-state.service.js';
import { createRegistrationCleanup } from '../src/services/registration-cleanup.service.js';

test('withdrawal retries failed storage cleanup, removes own recovery records and preserves another owner', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'my-withdrawal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let time = 1000000000,
    fail = true,
    deleted = 0,
    revoked = 0;
  const state = createFileRegistrationState({ path: join(dir, 'state.json'), now: () => time });
  await state.command('recovery_put', 'mine', { userId: 'mine', grantHash: 'test' });
  await state.command('recovery_put', 'cooldown:mine', { expiresAt: time + 10000 });
  await state.command('recovery_put', 'other', { userId: 'other', grantHash: 'preserve' });
  await state.command('queue_withdrawal', null, { userId: 'mine' });
  const cleanup = createRegistrationCleanup({
    state,
    auth: {
      readUser: async (id) => ({ id }),
      requestWithdrawal: async (id) => {
        assert.equal(id, 'mine');
        revoked++;
      },
      deleteUser: async (id) => {
        assert.equal(id, 'mine');
        deleted++;
      },
    },
    storage: {
      purge: async (id) => {
        assert.equal(id, 'mine');
        if (fail) throw Error('temporary failure');
      },
    },
  });
  assert.deepEqual(await cleanup.runWithdrawals(), { removed: 0 });
  assert.equal(deleted, 0);
  assert.equal((await state.command('access', null, { userId: 'mine' })).allowed, false);
  assert.ok(await state.command('recovery_get', 'mine'));
  fail = false;
  time += 3600000;
  assert.deepEqual(await cleanup.runWithdrawals(), { removed: 1 });
  assert.equal(deleted, 1);
  assert.equal(revoked, 2);
  assert.equal(await state.command('recovery_get', 'mine'), null);
  assert.equal(await state.command('recovery_get', 'cooldown:mine'), null);
  assert.equal((await state.command('recovery_get', 'other')).grantHash, 'preserve');
  assert.deepEqual(await cleanup.runWithdrawals(), { removed: 0 });
});
