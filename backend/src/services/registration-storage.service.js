import { registrationClient } from './registration-auth.service.js';
const missing = (e) =>
  String(e?.statusCode || e?.status) === '404' ||
  /bucket not found|object not found/i.test(e?.message || '');
export function createRegistrationStorage(client = registrationClient()) {
  const remove = async (bucket, keys) => {
    if (!keys.length) return;
    const { error } = await client.storage.from(bucket).remove(keys);
    if (error && !missing(error)) throw Error('STORAGE_DELETE_FAILED');
  };
  async function list(prefix) {
    const out = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const { data, error } = await client.storage
        .from('account-registration')
        .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) {
        if (missing(error)) return [];
        throw Error('STORAGE_LIST_FAILED');
      }
      out.push(
        ...data.map((item) => ({ name: prefix + '/' + item.name, size: item.metadata?.size }))
      );
      if (data.length < 100) return out;
    }
    throw Error('STORAGE_SCAN_LIMIT');
  }
  return {
    async purge(userId, renew = async () => {}) {
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw Error('INVALID_OWNER');
      const ownedChallenges = new Set(),
        owned = [];
      // Old versions wrote JSON to this bucket. Inspect ownership instead of trusting an email in JWTs.
      for (const folder of ['challenges', 'usernames', 'emails']) {
        await renew();
        const items = await list('registration/' + folder);
        for (const item of items) {
          await renew();
          if (
            item.size > 65536 ||
            !item.name.startsWith('registration/' + folder + '/') ||
            !item.name.endsWith('.json')
          )
            throw Error('UNEXPECTED_REGISTRATION_OBJECT');
          const { data, error } = await client.storage
            .from('account-registration')
            .download(item.name);
          if (error) {
            if (missing(error)) continue;
            throw Error('STORAGE_READ_FAILED');
          }
          if (data.size > 65536) throw Error('REGISTRATION_OBJECT_TOO_LARGE');
          let record;
          try {
            record = JSON.parse(await data.text());
          } catch {
            throw Error('INVALID_REGISTRATION_OBJECT');
          }
          if (
            record.userId === userId ||
            (record.challengeId && ownedChallenges.has(record.challengeId))
          ) {
            owned.push(item.name);
            if (folder === 'challenges')
              ownedChallenges.add(
                record.id ||
                  item.name
                    .split('/')
                    .pop()
                    .replace(/\.json$/, '')
              );
          }
        }
      }
      // Keep the ownership evidence until all claims are gone, including after a failed retry.
      for (const keys of [
        owned.filter((k) => !k.startsWith('registration/challenges/')),
        owned.filter((k) => k.startsWith('registration/challenges/')),
      ]) {
        for (let i = 0; i < keys.length; i += 100) {
          await renew();
          await remove('account-registration', keys.slice(i, i + 100));
        }
      }
      await renew();
      await remove('user-workspaces', [userId + '.json']);
    },
  };
}
