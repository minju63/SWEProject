// Explicit, resumable protection of existing profiles. Preview is read-only.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { isDeepStrictEqual as same } from 'node:util';
import { supabase } from '../../src/lib/supabase.js';
import {
  protectedProfiles,
  sensitiveProfileFields,
} from '../../src/services/protected-profile.service.js';
import { profileCipher } from '../../src/services/profile-cipher.service.js';
import { readPersonal } from '../../src/services/my-workspace.service.js';

async function checked(q) {
  const { data, error } = await q;
  if (error) throw Error('PROFILE_STORAGE_OR_DATABASE_UNAVAILABLE');
  return data;
}
async function workspace(owner) {
  const { data, error } = await supabase.storage.from('user-workspaces').download(owner + '.json');
  if (error) {
    if (String(error.statusCode || error.status) === '404') return { manual: [], details: {} };
    throw Error('PROFILE_STORAGE_UNAVAILABLE');
  }
  return JSON.parse(await data.text());
}
async function main() {
  const apply = process.argv.includes('--apply');
  const url = new URL(process.env.SUPABASE_URL);
  assert.equal(url.hostname, 'flkoszigqobfkztbvsyw.supabase.co', 'Unexpected service project');
  const bucket = await checked(supabase.storage.getBucket('user-workspaces'));
  assert.equal(bucket.public, false, 'Profile workspace must remain private');
  const before = await checked(supabase.from('user_profile').select('*').order('user_id'));
  const snapshots = new Map(),
    decrypted = new Map();
  // Inspect every private object before key initialization; never replace a lost key.
  let encrypted = 0;
  for (let offset = 0; offset < 10000; offset += 100) {
    const files = await checked(
      supabase.storage
        .from('user-workspaces')
        .list('', { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    );
    for (const file of files) {
      if (!/^[0-9a-f-]{36}\.json$/i.test(file.name))
        throw Error('Unexpected private workspace object');
      const owner = file.name.slice(0, -5),
        state = await workspace(owner);
      if (state.sensitiveProfile) {
        await profileCipher.decrypt(owner, state.sensitiveProfile);
        encrypted++;
      }
    }
    if (files.length < 100) break;
    if (offset === 9900) throw Error('PROFILE_SCAN_LIMIT');
  }
  for (const row of before) {
    const original = await workspace(row.user_id),
      canonical = await readPersonal(row.user_id);
    assert.ok(same(original, canonical), 'Workspace format requires review before migration');
    snapshots.set(row.user_id, original);
    decrypted.set(row.user_id, await protectedProfiles.find(row.user_id));
  }
  const pending = before.filter((row) =>
    sensitiveProfileFields.some((k) => (Array.isArray(row[k]) ? row[k].length : row[k] != null))
  );
  const report = {
    mode: apply ? 'APPLY' : 'PREVIEW',
    profiles: before.length,
    legacy_profiles_to_protect: pending.length,
    existing_encrypted_workspaces: encrypted,
    db_writes: 0,
  };
  if (!apply) {
    console.log(JSON.stringify({ ...report, status: 'PREFLIGHT_PASS' }));
    return;
  }
  await profileCipher.initialize();
  for (const row of pending) {
    const current = await checked(
      supabase.from('user_profile').select('*').eq('user_id', row.user_id).single()
    );
    assert.ok(same(current, row), 'Concurrent profile change; retry preview');
    await protectedProfiles.migrate(row.user_id);
    report.db_writes++;
  }
  const after = await checked(supabase.from('user_profile').select('*').order('user_id'));
  assert.equal(after.length, before.length);
  for (const row of after) {
    const old = before.find((x) => x.user_id === row.user_id),
      owner = row.user_id;
    for (const k of Object.keys(old).filter(
      (k) => !sensitiveProfileFields.includes(k) && k !== 'updated_at'
    ))
      assert.ok(same(old[k], row[k]), 'Non-sensitive profile field changed');
    for (const k of sensitiveProfileFields)
      assert.ok(
        row[k] == null || (Array.isArray(row[k]) && row[k].length === 0),
        'Plaintext field remains'
      );
    const result = await protectedProfiles.find(owner);
    for (const k of sensitiveProfileFields)
      assert.ok(same(result[k], decrypted.get(owner)[k]), 'Owner read-back differs');
    const state = await workspace(owner),
      prior = snapshots.get(owner);
    for (const k of Object.keys(prior).filter((k) => k !== 'sensitiveProfile'))
      assert.ok(same(prior[k], state[k]), 'Other personal record changed');
  }
  console.log(
    JSON.stringify({
      ...report,
      status: 'COMPLETE_VERIFIED',
      plaintext_sensitive_fields_remaining: 0,
      owner_readback_matches: true,
      other_profile_and_workspace_data_preserved: true,
    })
  );
}
main().catch(() => {
  console.error(
    'PROFILE_PROTECTION_STOPPED_REVIEW_REQUIRED: no personal values or key material logged'
  );
  process.exitCode = 1;
});
