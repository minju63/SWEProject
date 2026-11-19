import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileRegistrationState } from '../src/services/registration-file-state.service.js';
import { createAccountRecovery } from '../src/services/account-recovery.service.js';
import { createSignupService } from '../src/services/signup.service.js';
import { createAccountMailer } from '../src/services/account-mail.service.js';
const email = 'member@example.com',
  username = 'member123',
  password = 'test123!';
async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'cheonghae-auth-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'journal.json');
  let time = 1000000000,
    code = '123456',
    sends = 0,
    verifies = 0,
    updates = 0,
    revokes = 0;
  const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email,
      app_metadata: { registration: { username } },
    },
    mails = [];
  const state = createFileRegistrationState({ path, now: () => time });
  const auth = {
    async findAccount(q) {
      return (!q.email || q.email === email) && (!q.username || q.username === username)
        ? user
        : null;
    },
    async sendRecovery() {
      sends++;
      code = sends === 1 ? '123456' : '654321';
    },
    async verifyRecovery(e, token) {
      verifies++;
      assert.equal(e, email);
      if (token !== code) throw Error('invalid OTP');
      return { user, access_token: 'provider-session-secret' };
    },
    async samePassword(e, p) {
      assert.equal(e, email);
      return p === password;
    },
    async setPassword(id) {
      assert.equal(id, user.id);
      updates++;
    },
    async revokeSessions(token) {
      assert.equal(token, 'provider-session-secret');
      revokes++;
    },
  };
  const args = {
    state,
    auth,
    mail: {
      async sendUsername(...args) {
        mails.push(args);
      },
    },
    secret: 'test-encryption-key',
    now: () => time,
  };
  return {
    args,
    path,
    state,
    auth,
    mails,
    service: createAccountRecovery(args),
    restart: () =>
      createAccountRecovery({
        ...args,
        state: createFileRegistrationState({ path, now: () => time }),
      }),
    advance: (n) => (time += n),
    counts: () => ({ sends, verifies, updates, revokes }),
  };
}
test('find-ID sends only to registered email and never returns the ID', async (t) => {
  const f = await fixture(t);
  const result = await f.service.findUsername(email);
  assert.deepEqual(f.mails, [[email, username]]);
  assert.ok(!JSON.stringify(result).includes(username));
  assert.equal((await f.service.findUsername('absent@example.com')).registered, false);
});

test('authenticated password change fixes the account and rejects other owners and reset grants', async (t) => {
  const f = await fixture(t),
    id = '11111111-1111-4111-8111-111111111111';
  f.auth.readUser = async (owner) =>
    owner === id ? { id, email, app_metadata: { registration: { username } } } : null;
  const change = createAccountRecovery({ ...f.args, purpose: 'password-change' });
  const request = await change.start('someoneelse', 'other@example.com', id);
  assert.equal(request.email, email);
  await assert.rejects(
    change.verify(request.requestId, '123456', '22222222-2222-4222-8222-222222222222'),
    (e) => e.code === 'USER_MISMATCH'
  );
  await assert.rejects(
    f.service.verify(request.requestId, '123456'),
    (e) => e.code === 'INVALID_RECOVERY'
  );
  const verified = await change.verify(request.requestId, '123456', id);
  await assert.rejects(
    change.complete(request.requestId, verified.grant, 'newpass1!', 'newpass1!'),
    (e) => e.code === 'USER_MISMATCH'
  );
  await change.complete(request.requestId, verified.grant, 'newpass1!', 'newpass1!', id);
  assert.equal(f.counts().updates, 1);
  assert.equal(f.counts().revokes, 1);
});
test('SMTP is not reported as sent without configuration', async () => {
  await assert.rejects(
    createAccountMailer({}).sendUsername(email, username),
    (e) => e.code === 'MAIL_CONFIG'
  );
});
test('SMTP sends the ID only to its registered address with TLS and reports rejection', async () => {
  const env = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender',
    SMTP_PASSWORD: 'secret',
    SMTP_FROM: 'sender@example.com',
  };
  let closed = false;
  const mail = createAccountMailer(env, (options) => {
    assert.equal(options.requireTLS, true);
    assert.equal(options.auth.user, 'sender');
    return {
      async sendMail(message) {
        assert.equal(message.to, email);
        assert.equal(message.subject, '청해 아이디 안내');
        assert.ok(message.text.includes(username));
        return { accepted: [email] };
      },
      close() {
        closed = true;
      },
    };
  });
  await mail.sendUsername(email, username);
  assert.equal(closed, true);
  await assert.rejects(
    createAccountMailer(env, () => ({
      sendMail: async () => ({ accepted: [] }),
      close() {},
    })).sendUsername(email, username),
    (e) => e.code === 'MAIL_SEND'
  );
});
test('reset validates account pair, shares resend cooldown and invalidates old OTP', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.start('wronguser', email), (e) => e.code === 'ACCOUNT_MISMATCH');
  const r = await f.service.start(username.toUpperCase(), email);
  await assert.rejects(f.restart().start(username, email), (e) => e.code === 'COOLDOWN');
  await assert.rejects(f.service.resend(r.requestId), (e) => e.code === 'COOLDOWN');
  f.advance(60001);
  await f.service.resend(r.requestId);
  await assert.rejects(f.service.verify(r.requestId, '123456'));
  assert.ok((await f.service.verify(r.requestId, '654321')).grant);
});
test('five errors persist over restart and expiry stops provider calls', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(username, email);
  for (let i = 0; i < 5; i++) await assert.rejects(f.restart().verify(r.requestId, '000000'));
  await assert.rejects(f.service.verify(r.requestId, '123456'), (e) => e.code === 'ATTEMPTS');
  assert.equal(f.counts().verifies, 5);
  f.advance(300001);
  await assert.rejects(
    f.service.verify(r.requestId, '123456'),
    (e) => e.code === 'INVALID_RECOVERY'
  );
  assert.equal(f.counts().verifies, 5);
});
test('reset rejects wrong grant, old password, invalid characters and confirmation mismatch', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(username, email),
    v = await f.service.verify(r.requestId, '123456');
  await assert.rejects(
    f.service.complete(r.requestId, 'wrong', 'newpass1!', 'newpass1!'),
    (e) => e.code === 'INVALID_RECOVERY'
  );
  await assert.rejects(
    f.service.complete(r.requestId, v.grant, password, password),
    (e) => e.code === 'SAME_PASSWORD'
  );
  await assert.rejects(
    f.service.complete(r.requestId, v.grant, 'newpass1?', 'newpass1?'),
    (e) => e.code === 'INVALID_PASSWORD'
  );
  await assert.rejects(
    f.service.complete(r.requestId, v.grant, 'newpass1!', 'different'),
    (e) => e.code === 'PASSWORD_MISMATCH'
  );
  await f.restart().complete(r.requestId, v.grant, 'newpass1!', 'newpass1!');
  assert.deepEqual(f.counts(), { sends: 1, verifies: 1, updates: 1, revokes: 1 });
  await assert.rejects(
    f.service.complete(r.requestId, v.grant, 'newpass1!', 'newpass1!'),
    (e) => e.code === 'INVALID_RECOVERY'
  );
  const journal = await readFile(f.path, 'utf8');
  for (const value of [v.grant, 'provider-session-secret', 'newpass1!', '123456'])
    assert.ok(!journal.includes(value));
});
test('new reset request revokes an already verified operation and expiry limits grant', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(username, email),
    v = await f.service.verify(r.requestId, '123456');
  f.advance(60001);
  await f.service.start(username, email);
  await assert.rejects(
    f.service.complete(r.requestId, v.grant, 'newpass1!', 'newpass1!'),
    (e) => e.code === 'INVALID_RECOVERY'
  );
});
test('file-backed signup works without registration SQL and persists checks after restart', async (t) => {
  const f = await fixture(t);
  let user;
  const auth = {
    emailExists: async () => false,
    createPending: async () => (user = { id: '22222222-2222-4222-8222-222222222222' }),
    resend: async () => {},
    verify: async () => ({ user, access_token: 'access', refresh_token: 'refresh' }),
    complete: async () => {},
    login: async () => ({}),
  };
  const make = () =>
    createSignupService({
      state: createFileRegistrationState({ path: f.path, now: () => 1000000000 }),
      auth,
      cleanup: { runJob: async () => true },
    });
  const s = make(),
    input = {
      username,
      nickname: '회원',
      email,
      password,
      confirmation: password,
      ageConfirmed: true,
      terms: true,
      privacy: true,
      personalization: false,
    };
  const r = await s.start(input);
  assert.equal((await make().available(username)).available, false);
  await assert.rejects(make().resend(r.challengeId), (e) => e.code === 'COOLDOWN');
  await make().verify(r.challengeId, '123456');
  assert.deepEqual(await make().complete(r.challengeId, user.id), { next: '/' });
  assert.ok(!(await readFile(f.path, 'utf8')).includes(password));
});
