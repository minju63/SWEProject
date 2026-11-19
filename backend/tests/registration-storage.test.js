import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationStorage } from '../src/services/registration-storage.service.js';
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const files = new Map([
    ['registration/challenges/owner.json', { id: 'owner', userId: owner }],
    ['registration/usernames/owner.json', { challengeId: 'owner' }],
    ['registration/emails/owner.json', { challengeId: 'owner' }],
    ['registration/challenges/other.json', { id: 'other', userId: other }],
    ['registration/usernames/other.json', { challengeId: 'other' }],
  ]);
  let fail = true;
  const deleted = [],
    workspaces = new Set([owner + '.json', other + '.json']);
  const client = {
    storage: {
      from: (bucket) => ({
        async list(prefix, { offset, limit }) {
          return {
            data: [...files.keys()]
              .filter((k) => k.startsWith(prefix + '/'))
              .sort()
              .slice(offset, offset + limit)
              .map((k) => ({ name: k.slice(prefix.length + 1), metadata: { size: 100 } })),
          };
        },
        async download(key) {
          return { data: new Blob([JSON.stringify(files.get(key))]) };
        },
        async remove(keys) {
          if (bucket === 'user-workspaces') {
            keys.forEach((k) => workspaces.delete(k));
            return {};
          }
          for (const key of keys) {
            if (fail && key.startsWith('registration/challenges/'))
              return { error: { status: 503 } };
            deleted.push(key);
            files.delete(key);
          }
          return {};
        },
      }),
    },
  };
  return {
    service: createRegistrationStorage(client),
    files,
    deleted,
    workspaces,
    allow: () => (fail = false),
  };
}
test('legacy cleanup deletes only owner claims, retains evidence on failure, then retries', async () => {
  const f = fixture();
  await assert.rejects(f.service.purge(owner));
  assert.ok(f.files.has('registration/challenges/owner.json'));
  assert.ok(!f.files.has('registration/usernames/owner.json'));
  assert.ok(f.workspaces.has(owner + '.json'));
  f.allow();
  await f.service.purge(owner);
  assert.ok(!f.files.has('registration/challenges/owner.json'));
  assert.ok(!f.workspaces.has(owner + '.json'));
  assert.ok(f.files.has('registration/challenges/other.json'));
  assert.ok(f.files.has('registration/usernames/other.json'));
  assert.ok(f.workspaces.has(other + '.json'));
  assert.ok(
    f.deleted.indexOf('registration/challenges/owner.json') >
      f.deleted.indexOf('registration/emails/owner.json')
  );
});
test('missing legacy bucket is safe and workspace cleanup still runs', async () => {
  const keys = [];
  const service = createRegistrationStorage({
    storage: {
      from: (bucket) => ({
        list: async () => ({ error: { status: 404 } }),
        remove: async (items) => {
          keys.push([bucket, items]);
          return {};
        },
      }),
    },
  });
  await service.purge(owner);
  assert.deepEqual(keys, [['user-workspaces', [owner + '.json']]]);
});
