import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileRegistrationState } from '../src/services/registration-file-state.service.js';
import { createAccountIdentity } from '../src/services/account-identity.service.js';
import { createAccountRecovery } from '../src/services/account-recovery.service.js';
import { createSignupService } from '../src/services/signup.service.js';

const owner = '11111111-1111-4111-8111-111111111111';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'identity-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  let clock = 1000000,
    writes = 0,
    failure = '',
    sendFail = false;
  const users = [
    {
      id: owner,
      email: 'old@example.com',
      app_metadata: {
        registration: { username: 'oldmember1', consents: { terms: true } },
        unchanged: 'yes',
      },
      user_metadata: { display_name: '회원' },
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'taken@example.com',
      app_metadata: { registration: { username: 'takenuser1' } },
    },
  ];
  const mails = [];
  const state = createFileRegistrationState({ path, now: () => clock });
  const auth = {
    readUser: async (id) => structuredClone(users.find((u) => u.id === id)),
    findAccount: async (q) =>
      structuredClone(
        users.find(
          (u) =>
            (!q.username || u.app_metadata.registration.username === q.username) &&
            (!q.email || u.email === q.email)
        ) || null
      ),
    changeIdentity: async (id, kind, value) => {
      writes++;
      if (failure === 'before') throw Error('provider unavailable');
      const u = users.find((u) => u.id === id);
      if (kind === 'email') u.email = value;
      else u.app_metadata.registration.username = value;
      if (failure === 'after') throw Error('response lost');
    },
    login: async (email) => ({ user: structuredClone(users.find((u) => u.email === email)) }),
  };
  const args = {
    state,
    auth,
    secret: 'test-only-secret',
    now: () => clock,
    mail: {
      sendIdentityCode: async (...v) => {
        if (sendFail) throw Error('mail failed');
        mails.push(v);
      },
    },
  };
  const service = createAccountIdentity(args);
  async function verified(kind = 'username') {
    const p = await service.start(owner, kind);
    const proof = await service.verify(owner, kind, p.requestId, mails.at(-1)[1]);
    return { ...p, ...proof };
  }
  return {
    service,
    verified,
    state,
    auth,
    users,
    mails,
    path,
    args,
    advance: (ms) => (clock += ms),
    setFailure: (v) => (failure = v),
    setSendFail: (v) => (sendFail = v),
    writes: () => writes,
  };
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code);
test('completed signup journal follows identity changes and releases the old value', async (t) => {
  const f = await fixture(t);
  await writeFile(
    f.path,
    JSON.stringify({
      requests: {
        original: {
          user_id: owner,
          status: 'completed',
          username: 'oldmember1',
          email: 'old@example.com',
        },
      },
      rates: {},
      deletions: {},
      recovery: {},
    })
  );
  const p = await f.verified();
  await f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1');
  assert.equal(await f.state.command('lookup', null, { username: 'oldmember1' }), null);
  assert.equal((await f.state.command('lookup', null, { username: 'newmember1' })).user_id, owner);
  assert.equal(
    (await f.state.command('available', null, { kind: 'username', value: 'oldmember1' })).available,
    true
  );
  assert.equal(
    (await f.state.command('available', null, { kind: 'username', value: 'newmember1' })).available,
    false
  );
});
test('expired OTP can be resent or cancelled without trapping the form', async (t) => {
  const f = await fixture(t),
    p = await f.service.start(owner, 'email');
  f.advance(300001);
  await f.service.resend(owner, 'email', p.requestId);
  const verified = await f.service.verify(owner, 'email', p.requestId, f.mails.at(-1)[1]);
  assert.ok(verified.grant);
  f.advance(300001);
  await f.service.cancel(owner, 'email', p.requestId);
  assert.equal(f.users[0].email, 'old@example.com');
});
test('identity changes require owner and matching purpose; plaintext OTP and grants are not journaled', async (t) => {
  const f = await fixture(t),
    p = await f.service.start(owner, 'username');
  assert.equal(f.mails[0][0], 'old@example.com');
  const otp = f.mails[0][1];
  await rejects(f.service.verify('other', 'username', p.requestId, otp), 'INVALID_CHANGE');
  await rejects(f.service.verify(owner, 'email', p.requestId, otp), 'INVALID_CHANGE');
  const proof = await f.service.verify(owner, 'username', p.requestId, otp);
  const disk = await readFile(f.path, 'utf8');
  assert.ok(!disk.includes('"' + otp + '"'));
  assert.ok(!disk.includes(proof.grant));
  await rejects(
    f.service.complete(owner, 'username', p.requestId, 'wrong', 'newmember1'),
    'NOT_VERIFIED'
  );
  assert.equal(f.writes(), 0);
});
test('username validates format, same and duplicate values then preserves user ID, consent and metadata', async (t) => {
  const f = await fixture(t),
    p = await f.verified();
  for (const [value, code] of [
    ['short', 'INVALID_VALUE'],
    ['oldmember1', 'SAME_VALUE'],
    ['takenuser1', 'IDENTITY_EXISTS'],
  ])
    await rejects(f.service.complete(owner, 'username', p.requestId, p.grant, value), code);
  const result = await f.service.complete(owner, 'username', p.requestId, p.grant, 'NEWMEMBER1');
  assert.equal(result.user_id, owner);
  assert.equal(f.users[0].app_metadata.registration.username, 'newmember1');
  assert.equal(f.users[0].app_metadata.registration.consents.terms, true);
  assert.equal(f.users[0].user_metadata.display_name, '회원');
  assert.equal(f.users[0].email, 'old@example.com');
  const signup = createSignupService({ state: f.state, auth: f.auth });
  await assert.rejects(signup.login('oldmember1', 'test123!'), (e) => e.code === 'INVALID_LOGIN');
  assert.equal((await signup.login('newmember1', 'test123!')).user.id, owner);
  assert.equal(f.users[1].app_metadata.registration.username, 'takenuser1');
  await f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1');
  assert.equal(f.writes(), 1);
});
test('email retains original until new address is verified and duplicate/same values are rejected', async (t) => {
  const f = await fixture(t),
    p = await f.verified('email');
  await rejects(
    f.service.prepare(owner, 'email', p.requestId, p.grant, 'old@example.com'),
    'SAME_VALUE'
  );
  await rejects(
    f.service.prepare(owner, 'email', p.requestId, p.grant, 'taken@example.com'),
    'IDENTITY_EXISTS'
  );
  await f.service.prepare(owner, 'email', p.requestId, p.grant, 'NEW@example.com');
  assert.equal(f.users[0].email, 'old@example.com');
  assert.equal(f.mails.at(-1)[0], 'new@example.com');
  await rejects(
    f.service.complete(owner, 'email', p.requestId, p.grant, null, 'invalid'),
    'INVALID_OTP'
  );
  assert.equal(f.users[0].email, 'old@example.com');
  await f.service.complete(owner, 'email', p.requestId, p.grant, null, f.mails.at(-1)[1]);
  assert.equal(f.users[0].email, 'new@example.com');
  assert.equal(f.users[0].id, owner);
  assert.equal(f.users[0].app_metadata.registration.username, 'oldmember1');
});
test('OTP attempts persist after restart, resends obey cooldown and old OTP expires', async (t) => {
  const f = await fixture(t),
    p = await f.service.start(owner, 'email');
  await rejects(f.service.resend(owner, 'email', p.requestId), 'COOLDOWN');
  for (let i = 0; i < 5; i++)
    await rejects(f.service.verify(owner, 'email', p.requestId, 'invalid'), 'INVALID_OTP');
  const restarted = createAccountIdentity({
    ...f.args,
    state: createFileRegistrationState({ path: f.path, now: () => 1000000 }),
  });
  await rejects(restarted.verify(owner, 'email', p.requestId, f.mails.at(-1)[1]), 'ATTEMPTS');
  f.advance(60001);
  await f.service.resend(owner, 'email', p.requestId);
  f.advance(300001);
  await rejects(f.service.verify(owner, 'email', p.requestId, f.mails.at(-1)[1]), 'EXPIRED');
  assert.equal(f.writes(), 0);
});
test('reserved new email blocks signup, can be cancelled and never changes account on mail failure', async (t) => {
  const f = await fixture(t),
    p = await f.verified('email');
  f.setSendFail(true);
  await assert.rejects(f.service.prepare(owner, 'email', p.requestId, p.grant, 'new@example.com'));
  assert.equal(f.users[0].email, 'old@example.com');
  assert.equal(
    (await f.state.command('available', null, { kind: 'email', value: 'new@example.com' }))
      .available,
    false
  );
  await rejects(
    f.state.command('reserve', 'signup-other', {
      username: 'newperson1',
      email: 'new@example.com',
    }),
    'IDENTITY_EXISTS'
  );
  await f.service.cancel(owner, 'email', p.requestId);
  assert.equal(
    (await f.state.command('available', null, { kind: 'email', value: 'new@example.com' }))
      .available,
    true
  );
  await rejects(
    f.service.complete(owner, 'email', p.requestId, p.grant, null, '123456'),
    'EXPIRED'
  );
});
test('uncertain provider write is resumed after restart without duplicate write or releasing reservation', async (t) => {
  const f = await fixture(t),
    p = await f.verified();
  f.setFailure('after');
  await assert.rejects(f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1'));
  assert.equal(f.writes(), 1);
  f.advance(60001);
  await rejects(f.service.start(owner, 'email'), 'CHANGE_PENDING');
  await rejects(f.state.command('recovery_invalidate_user', null, { userId: owner }), 'BUSY');
  await rejects(f.service.cancel(owner, 'username', p.requestId), 'CHANGE_PENDING');
  const restarted = createAccountIdentity(f.args);
  assert.equal((await restarted.start(owner, 'username')).resumable, true);
  await restarted.resume(owner, 'username', p.requestId);
  assert.equal(f.writes(), 1);
  assert.equal(await f.state.command('identity_active', null, { userId: owner }), null);
});
test('provider failure before write leaves previous identity and retry recovers', async (t) => {
  const f = await fixture(t),
    p = await f.verified();
  f.setFailure('before');
  await assert.rejects(f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1'));
  assert.equal(f.users[0].app_metadata.registration.username, 'oldmember1');
  f.setFailure('');
  await f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1');
  assert.equal(f.users[0].app_metadata.registration.username, 'newmember1');
});
test('password workflow invalidates identity proof; overlapping new requests are serialized', async (t) => {
  const f = await fixture(t),
    p = await f.verified();
  f.advance(60001);
  f.auth.sendRecovery = async () => {};
  const recovery = createAccountRecovery({ ...f.args, purpose: 'password-change' });
  await recovery.start(null, null, owner);
  await rejects(
    f.service.complete(owner, 'username', p.requestId, p.grant, 'newmember1'),
    'EXPIRED'
  );
  f.advance(60001);
  const results = await Promise.allSettled([
    f.service.start(owner, 'username'),
    f.service.start(owner, 'email'),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter((x) => x.status === 'rejected')[0].reason.code, 'COOLDOWN');
});
