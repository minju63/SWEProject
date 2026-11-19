import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProfileCipher } from '../src/services/profile-cipher.service.js';
import { createProtectedProfiles } from '../src/services/protected-profile.service.js';
import { validateProfilePatch } from '../src/services/profile-validation.service.js';
import { judge } from '../src/services/eligibility.service.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'protected-profile-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'key.json'),
    cipher = createProfileCipher({ path });
  await cipher.initialize();
  const rows = new Map([
    [
      'a',
      {
        user_id: 'a',
        region_code: '26380',
        marital_status: '기혼',
        housing_benefit_status: '수급 중',
        special_targets: ['한부모가정'],
      },
    ],
    ['b', { user_id: 'b', marital_status: '미혼' }],
  ]);
  const files = new Map([
    ['a', { manual: [], details: { keep: true }, notificationSettings: { enabled: false } }],
    ['b', { manual: [], details: {} }],
  ]);
  let failStorage = false,
    failDb = false;
  const db = {
    from(table) {
      assert.equal(table, 'user_profile');
      let owner, patch;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          assert.equal(k, 'user_id');
          owner = v;
          return q;
        },
        maybeSingle: async () => ({ data: structuredClone(rows.get(owner) || null) }),
        upsert(value) {
          patch = value;
          owner = value.user_id;
          return q;
        },
        single: async () => {
          if (failDb) return { error: Error('database temporarily unavailable') };
          rows.set(owner, { ...rows.get(owner), ...patch });
          return { data: structuredClone(rows.get(owner)) };
        },
      };
      return q;
    },
  };
  const read = async (owner) => structuredClone(files.get(owner) || { manual: [], details: {} });
  const change = async (owner, fn) => {
    if (failStorage) throw Error('storage temporarily unavailable');
    const state = await read(owner);
    await fn(state);
    files.set(owner, state);
  };
  const service = createProtectedProfiles({ db, read, change, cipher });
  return {
    service,
    cipher,
    rows,
    files,
    path,
    failStorage: (v) => (failStorage = v),
    failDb: (v) => (failDb = v),
  };
}

test('sensitive profile moves to owner-bound ciphertext while preserving normal fields and other owners', async (t) => {
  const f = await fixture(t),
    before = await f.service.find('a');
  assert.equal(await f.service.migrate('a'), true);
  assert.equal(f.rows.get('a').marital_status, null);
  assert.equal(f.rows.get('a').housing_benefit_status, null);
  assert.equal(f.rows.get('a').special_targets, null);
  const stored = JSON.stringify(f.files.get('a'));
  for (const value of ['기혼', '수급 중', '한부모가정'])
    assert.equal(stored.includes(value), false);
  assert.equal(f.files.get('a').notificationSettings.enabled, false);
  assert.equal(f.files.get('a').details.keep, true);
  assert.equal(f.rows.get('b').marital_status, '미혼');
  assert.equal(f.files.get('b').sensitiveProfile, undefined);
  const after = await f.service.find('a');
  for (const key of ['marital_status', 'housing_benefit_status', 'special_targets', 'region_code'])
    assert.deepEqual(after[key], before[key]);
  const policy = {
    eligibility_verified: true,
    eligibility_conditions: {
      required: [{ field: 'marital_status', op: 'eq', value: '기혼' }],
      exclusions: [],
    },
  };
  assert.equal(judge(policy, before).result, judge(policy, after).result);
  await assert.rejects(
    f.cipher.decrypt('b', f.files.get('a').sensitiveProfile),
    (e) => e.code === 'PROFILE_PROTECTION_UNAVAILABLE'
  );
});

test('clearing optional sensitive fields removes their previous values and concurrent edits are preserved', async (t) => {
  const f = await fixture(t);
  await f.service.migrate('a');
  await Promise.all([
    f.service.upsert('a', { marital_status: '미혼' }),
    f.service.upsert('a', { housing_benefit_status: '수급하지 않음' }),
  ]);
  const updated = await f.service.find('a');
  assert.equal(updated.marital_status, '미혼');
  assert.equal(updated.housing_benefit_status, '수급하지 않음');
  await f.service.upsert('a', {
    marital_status: null,
    housing_benefit_status: null,
    special_targets: [],
  });
  const cleared = await f.service.find('a');
  assert.equal(cleared.marital_status, null);
  assert.equal(cleared.housing_benefit_status, null);
  assert.deepEqual(cleared.special_targets, []);
  const plain = await f.cipher.decrypt('a', f.files.get('a').sensitiveProfile);
  assert.deepEqual(plain, {
    marital_status: null,
    housing_benefit_status: null,
    special_targets: [],
  });
});

test('storage failure leaves legacy fields intact and a DB failure can resume from encrypted data', async (t) => {
  const f = await fixture(t);
  f.failStorage(true);
  await assert.rejects(f.service.migrate('a'));
  assert.equal(f.rows.get('a').marital_status, '기혼');
  f.failStorage(false);
  f.failDb(true);
  await assert.rejects(f.service.migrate('a'));
  assert.ok(f.files.get('a').sensitiveProfile);
  assert.equal((await f.service.find('a')).marital_status, '기혼');
  f.failDb(false);
  await f.service.migrate('a');
  assert.equal(f.rows.get('a').marital_status, null);
});

test('tampering or a missing key fails closed without creating a replacement key or falling back to plaintext', async (t) => {
  const f = await fixture(t);
  await f.service.migrate('a');
  const original = f.files.get('a').sensitiveProfile;
  f.files.get('a').sensitiveProfile = { ...original, tag: Buffer.alloc(16).toString('base64') };
  await assert.rejects(f.service.find('a'), (e) => e.code === 'PROFILE_PROTECTION_UNAVAILABLE');
  f.files.get('a').sensitiveProfile = original;
  await unlink(f.path);
  await assert.rejects(f.service.find('a'), (e) => e.code === 'PROFILE_PROTECTION_UNAVAILABLE');
  await assert.rejects(
    f.service.upsert('a', { marital_status: '미혼' }),
    (e) => e.code === 'PROFILE_PROTECTION_UNAVAILABLE'
  );
});

test('profile patch keeps unknown optional values empty and rejects invalid types before writing', () => {
  assert.deepEqual(
    validateProfilePatch({
      birth_date: '',
      marital_status: '선택 안 함',
      special_targets: null,
      current_status: [],
      lives_separately: false,
      interest_categories: ['문화', '문화'],
      user_id: 'forged',
    }),
    {
      birth_date: null,
      marital_status: null,
      current_status: [],
      interest_categories: ['문화'],
      special_targets: [],
      lives_separately: false,
    }
  );
  for (const patch of [
    { marital_status: false },
    { special_targets: '장애인' },
    { lives_separately: 'false' },
    { birth_date: '2099-01-01' },
    { interest_categories: ['unknown'] },
    null,
  ])
    assert.throws(() => validateProfilePatch(patch));
});
