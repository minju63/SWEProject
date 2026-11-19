import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createRegistrationState } from '../src/services/registration-state.service.js';
import { createRegistrationCleanup } from '../src/services/registration-cleanup.service.js';
import { createSignupService } from '../src/services/signup.service.js';
import rules from '../../shared/signup-rules.mjs';
const input = {
  username: 'newuser123',
  nickname: '새회원',
  email: 'signup@example.com',
  password: 'test123!',
  confirmation: 'test123!',
  ageConfirmed: true,
  terms: true,
  privacy: true,
  personalization: true,
};
const legacy = '11111111-1111-4111-8111-111111111111';
async function fixture(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;
 create table storage.objects(id uuid primary key default gen_random_uuid(),name text,bucket_id text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;
 grant select on storage.objects to authenticated;
 create policy readable on storage.objects for select to authenticated using(true);
 insert into storage.objects(name,bucket_id) values('poster.png','policy-posters'),('private.json','user-workspaces');
 create table public.place(id integer);alter table public.place enable row level security;
 grant select on public.place to authenticated;
 create policy readable on public.place for select to authenticated using(true);insert into public.place values(1);
 create table public.user_profile(user_id uuid references auth.users on delete cascade);alter table public.user_profile enable row level security;
 grant select,insert,update,delete on public.user_profile to authenticated;
 create policy owner on public.user_profile to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 insert into auth.users(id,email) values('${legacy}','legacy@example.com');insert into user_profile(user_id) values('${legacy}');`);
  await pg.exec(
    await readFile(
      new URL('./fixtures/registration-hardening.proposed.sql', import.meta.url),
      'utf8'
    )
  );
  const state = createRegistrationState({
    rpc: async (_, { p_action, p_id, p_input }) => {
      try {
        return {
          data: (
            await pg.query('select public.registration_command($1,$2::uuid,$3::jsonb) as result', [
              p_action,
              p_id,
              JSON.stringify(p_input),
            ])
          ).rows[0].result,
        };
      } catch (error) {
        throw error;
      }
    },
  });
  let code = '123456',
    sends = 0,
    verifies = 0,
    completeFailure = false,
    storageFailure = false;
  const purged = [];
  const readUser = async (id) => {
    const r = (await pg.query('select * from auth.users where id=$1', [id])).rows[0];
    return r ? { id: r.id, email: r.email, app_metadata: r.raw_app_meta_data } : null;
  };
  const auth = {
    emailExists: async (email) =>
      (await state.command('auth_email_exists', null, { email })).exists,
    async createPending(email, _password, _nickname, id) {
      const uid = randomUUID();
      await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3::jsonb)', [
        uid,
        email,
        JSON.stringify({ registration_pending: true, registration_request_id: id }),
      ]);
      return { id: uid };
    },
    async resend() {
      sends++;
      code = sends === 1 ? '123456' : '654321';
    },
    async verify(email, token) {
      verifies++;
      if (token !== code) throw Error('BAD_OTP');
      const r = (await pg.query('select id from auth.users where email=$1', [email])).rows[0];
      return { user: { id: r.id }, access_token: 'access', refresh_token: 'refresh' };
    },
    async complete(id) {
      if (completeFailure) throw Error('AUTH_FAILED');
      await pg.query(
        `update auth.users set raw_app_meta_data=raw_app_meta_data||'{"registration_pending":false}'::jsonb where id=$1`,
        [id]
      );
    },
    readUser,
    async findPending(id, email) {
      const r = await state.command('find_pending_auth_user', id, { email });
      return r ? readUser(r.userId) : null;
    },
    async deleteUser(id) {
      await pg.query('delete from auth.users where id=$1', [id]);
    },
    login: async (email) => ({ email }),
  };
  const cleanup = createRegistrationCleanup({
    state,
    auth,
    storage: {
      async purge(id) {
        if (storageFailure) throw Error('STORAGE_FAILED');
        purged.push(id);
      },
    },
  });
  const service = createSignupService({ state, auth, cleanup });
  return {
    pg,
    state,
    auth,
    cleanup,
    service,
    purged,
    makeService: () => createSignupService({ state, auth, cleanup }),
    request: (id) => state.command('get', id),
    allowSend: (id) =>
      pg.query(
        "update app_private.registration_requests set last_send_attempt_at=now()-interval '61 seconds' where id=$1",
        [id]
      ),
    getVerifies: () => verifies,
    setCompleteFailure: (v) => (completeFailure = v),
    setStorageFailure: (v) => (storageFailure = v),
  };
}
test('signup validation and fourteenth birthday boundary', () => {
  assert.deepEqual(rules.signupErrors(input), {});
  for (const username of ['1newuser', 'short', 'abcdefghijklmnop', 'user_name'])
    assert.ok(rules.signupErrors({ ...input, username }).username);
  for (const key of ['ageConfirmed', 'terms', 'privacy'])
    assert.ok(Object.keys(rules.signupErrors({ ...input, [key]: false })).length);
  assert.equal(rules.birthDateError('2012-11-18', '2026-11-18'), null);
  assert.ok(rules.birthDateError('2012-11-19', '2026-11-18'));
  assert.ok(rules.birthDateError('2011-02-29', '2026-11-18'));
});
test('migration protects private state and preserves existing users', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.state.command('health'), { version: 2 });
  const r = (
    await f.pg.query(
      "select has_function_privilege('anon','public.registration_command(text,uuid,jsonb)','execute') as anon,has_function_privilege('authenticated','public.registration_command(text,uuid,jsonb)','execute') as member,has_function_privilege('service_role','public.registration_command(text,uuid,jsonb)','execute') as service"
    )
  ).rows[0];
  assert.deepEqual(r, { anon: false, member: false, service: true });
  assert.equal((await f.state.command('access', null, { userId: legacy })).allowed, true);
});
test('two servers reserve an identity once without persisting passwords or OTP', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.service.start(input), f.makeService().start(input)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rows = (await f.pg.query('select * from app_private.registration_requests')).rows;
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(input.password));
  assert.ok(!JSON.stringify(rows).includes('123456'));
});
test('resend cooldown and five attempts persist across server instances', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(input),
    second = f.makeService();
  await assert.rejects(second.resend(r.challengeId), (e) => e.code === 'COOLDOWN');
  for (let i = 0; i < 5; i++) await assert.rejects(second.verify(r.challengeId, '000000'));
  await assert.rejects(f.service.verify(r.challengeId, '123456'), (e) => e.code === 'ATTEMPTS');
  assert.equal(f.getVerifies(), 5);
  await f.allowSend(r.challengeId);
  await second.resend(r.challengeId);
  await assert.rejects(second.verify(r.challengeId, '123456'));
  assert.ok((await f.service.verify(r.challengeId, '654321')).session.access_token);
});
test('operation lease rejects concurrent verification and stale replies', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(input),
    id = r.challengeId;
  const results = await Promise.allSettled([
    f.state.command('begin_verify', id),
    f.state.command('begin_verify', id),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const first = results.find((r) => r.status === 'fulfilled').value;
  await f.pg.query(
    "update app_private.registration_requests set operation_until=now()-interval '1 second' where id=$1",
    [id]
  );
  const second = await f.state.command('begin_verify', id);
  await assert.rejects(
    f.state.command('finish_verify', id, { operationId: first.operation_id, success: false }),
    (e) => e.code === 'STALE_OPERATION'
  );
  assert.notEqual(first.operation_id, second.operation_id);
  assert.equal((await f.request(id)).attempts, 2);
});
test('direct Auth confirmation cannot bypass ledger or database RLS', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(input),
    request = await f.request(r.challengeId);
  await f.pg.query(
    `update auth.users set raw_app_meta_data=raw_app_meta_data||'{"registration_pending":false}'::jsonb where id=$1`,
    [request.user_id]
  );
  assert.equal((await f.state.command('access', null, { userId: request.user_id })).allowed, false);
  await assert.rejects(
    f.service.complete(r.challengeId, request.user_id),
    (e) => e.code === 'NOT_VERIFIED'
  );
  await f.pg.query('insert into user_profile(user_id) values($1)', [request.user_id]);
  await f.pg.query("select set_config('request.jwt.claim.sub',$1,false)", [request.user_id]);
  await f.pg.exec('set role authenticated');
  assert.equal((await f.pg.query('select * from user_profile')).rows.length, 0);
  // Signup restrictions must not hide another team's public map data or posters.
  assert.deepEqual((await f.pg.query('select * from place')).rows, [{id:1}]);
  assert.deepEqual((await f.pg.query('select bucket_id from storage.objects')).rows, [{bucket_id:'policy-posters'}]);
  await f.pg.exec('reset role');
  await f.pg.query("select set_config('request.jwt.claim.sub',$1,false)", [legacy]);
  await f.pg.exec('set role authenticated');
  assert.equal((await f.pg.query('select * from user_profile')).rows.length, 1);
  assert.equal((await f.pg.query('select * from storage.objects')).rows.length, 2);
  await f.pg.exec('reset role');
});
test('Auth hook rejects editable metadata and permits reserved server identity', async (t) => {
  const f = await fixture(t),
    id = randomUUID();
  await f.state.command('reserve', id, {
    ...input,
    consents: { ageConfirmed: true, terms: true, privacy: true, personalization: true },
  });
  await f.pg.exec('set role supabase_auth_admin');
  const hook = async (meta) =>
    (
      await f.pg.query('select public.hook_registration_before_user_created($1::jsonb) as result', [
        JSON.stringify({ user: { email: input.email, ...meta } }),
      ])
    ).rows[0].result;
  assert.equal(
    (await hook({ user_metadata: { registration_pending: true, registration_request_id: id } }))
      .error.http_code,
    403
  );
  assert.deepEqual(
    await hook({ app_metadata: { registration_pending: true, registration_request_id: id } }),
    {}
  );
  await f.pg.exec('reset role');
});
test('only verified owner completes and failed completion is retryable', async (t) => {
  const f = await fixture(t),
    r = await f.service.start({ ...input, personalization: false });
  await f.service.verify(r.challengeId, '123456');
  const row = await f.request(r.challengeId);
  await assert.rejects(
    f.service.complete(r.challengeId, legacy),
    (e) => e.code === 'USER_MISMATCH'
  );
  f.setCompleteFailure(true);
  await assert.rejects(f.service.complete(r.challengeId, row.user_id));
  assert.equal((await f.request(row.id)).status, 'verified');
  f.setCompleteFailure(false);
  assert.deepEqual(await f.service.complete(row.id, row.user_id), { next: '/' });
  assert.equal((await f.state.command('access', null, { userId: row.user_id })).allowed, true);
});
test('abandoned requests clean Auth and storage without deleting other owners', async (t) => {
  const f = await fixture(t),
    r = await f.service.start(input),
    row = await f.request(r.challengeId);
  await f.pg.query(
    "update app_private.registration_requests set expires_at=now()-interval '1 second' where id=$1",
    [row.id]
  );
  await f.cleanup.runBatch();
  assert.equal(await f.auth.readUser(row.user_id), null);
  assert.ok(await f.auth.readUser(legacy));
  assert.deepEqual(f.purged, [row.user_id]);
  assert.equal((await f.service.available(input.username)).available, true);
});
test('withdrawal remains blocked and retryable after storage failure', async (t) => {
  const f = await fixture(t),
    job = await f.state.command('queue_withdrawal', null, { userId: legacy });
  f.setStorageFailure(true);
  assert.equal(await f.cleanup.runJob(job.id), false);
  assert.ok(await f.auth.readUser(legacy));
  assert.equal((await f.state.command('access', null, { userId: legacy })).allowed, false);
  assert.equal(
    (await f.pg.query('select * from app_private.registration_deletions')).rows.length,
    1
  );
  f.setStorageFailure(false);
  await f.pg.exec(
    "update app_private.registration_deletions set next_attempt_at=now()-interval '1 second'"
  );
  assert.equal(await f.cleanup.runJob(job.id), true);
  assert.equal(await f.auth.readUser(legacy), null);
  assert.equal(
    (await f.pg.query('select * from app_private.registration_deletions')).rows.length,
    0
  );
});
test('cleanup claims and IP limits are shared by all servers', async (t) => {
  const f = await fixture(t);
  await f.state.command('queue_withdrawal', null, { userId: legacy });
  const jobs = await Promise.all([
    f.state.command('claim_cleanup'),
    f.state.command('claim_cleanup'),
  ]);
  assert.equal(jobs.filter(Boolean).length, 1);
  const results = await Promise.all(
    Array.from({ length: 80 }, () => f.state.command('rate', null, { key: 'hashed-ip' }))
  );
  assert.equal(results.filter((r) => r.allowed).length, 40);
});

test('explicit cancellation releases the identity after cleaning its account', async (t) => {
  const f = await fixture(t), r = await f.service.start(input), row = await f.request(r.challengeId);
  await f.service.cancel(row.id);
  assert.equal(await f.auth.readUser(row.user_id), null);
  assert.equal((await f.service.available(input.username)).available, true);
  assert.ok(await f.auth.readUser(legacy));
});

test('expired OTP is rejected before calling the authentication provider', async (t) => {
  const f = await fixture(t), r = await f.service.start(input);
  await f.pg.query("update app_private.registration_requests set otp_expires_at=now()-interval '1 second' where id=$1", [r.challengeId]);
  await assert.rejects(f.service.verify(r.challengeId, '123456'), e => e.code === 'EXPIRED');
  assert.equal(f.getVerifies(), 0);
});

test('cleanup recovers an Auth account created before an interrupted attach', async (t) => {
  const f = await fixture(t), id = randomUUID();
  await f.state.command('reserve', id, {...input, consents:{ageConfirmed:true, terms:true, privacy:true, personalization:true}});
  const user = await f.auth.createPending(input.email, input.password, input.nickname, id);
  await f.pg.query("update app_private.registration_requests set expires_at=now()-interval '1 second', operation_until=now()-interval '1 second' where id=$1", [id]);
  await f.cleanup.runBatch();
  assert.equal(await f.auth.readUser(user.id), null);
  assert.equal((await f.service.available(input.username)).available, true);
});

test('read-only deployment inspection SQL executes without altering account counts', async (t) => {
  const f = await fixture(t);
  await f.pg.exec('create table auth.identities(provider text)');
  const before = (await f.pg.query('select count(*) as count from auth.users')).rows[0].count;
  await f.pg.exec(await readFile(new URL('./fixtures/registration-inspection.sql', import.meta.url), 'utf8'));
  assert.equal((await f.pg.query('select count(*) as count from auth.users')).rows[0].count, before);
});
