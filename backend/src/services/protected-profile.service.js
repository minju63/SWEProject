import { supabase } from '../lib/supabase.js';
import { readPersonal, changePersonal } from './my-workspace.service.js';
import { profileCipher } from './profile-cipher.service.js';
export const sensitiveProfileFields = [
  'marital_status',
  'housing_benefit_status',
  'special_targets',
];
const blank = () => ({ marital_status: null, housing_benefit_status: null, special_targets: [] });
const hasData = (value) =>
  sensitiveProfileFields.some((k) =>
    Array.isArray(value?.[k]) ? value[k].length : value?.[k] != null
  );
export function createProtectedProfiles({
  db = supabase,
  read = readPersonal,
  change = changePersonal,
  cipher = profileCipher,
} = {}) {
  const queues = new Map();
  const checked = async (q) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  const raw = (owner) =>
    checked(db.from('user_profile').select('*').eq('user_id', owner).maybeSingle());
  const unpack = async (owner, row, state) =>
    state.sensitiveProfile
      ? { ...blank(), ...(await cipher.decrypt(owner, state.sensitiveProfile)) }
      : {
          ...blank(),
          ...Object.fromEntries(
            sensitiveProfileFields.filter((k) => row?.[k] != null).map((k) => [k, row[k]])
          ),
        };
  const exclusive = (owner, fn) => {
    const work = (queues.get(owner) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(owner, work);
    return work.finally(() => {
      if (queues.get(owner) === work) queues.delete(owner);
    });
  };
  return {
    async find(owner) {
      const [row, state] = await Promise.all([raw(owner), read(owner)]);
      if (!row && !state.sensitiveProfile) return null;
      return { ...row, user_id: owner, ...(await unpack(owner, row, state)) };
    },
    upsert(owner, patch) {
      return exclusive(owner, async () => {
        const row = await raw(owner);
        let sensitive;
        // Keep the workspace lock through reading/rewriting the encrypted part. Other personal records survive.
        await change(owner, async (state) => {
          sensitive = await unpack(owner, row, state);
          for (const key of sensitiveProfileFields)
            if (Object.hasOwn(patch, key)) sensitive[key] = patch[key];
          if (hasData(sensitive) || hasData(row) || state.sensitiveProfile)
            state.sensitiveProfile = await cipher.encrypt(owner, sensitive);
          else delete state.sensitiveProfile;
        });
        const publicPatch = { ...patch };
        for (const key of sensitiveProfileFields) delete publicPatch[key];
        const saved = await checked(
          db
            .from('user_profile')
            .upsert({
              ...publicPatch,
              ...Object.fromEntries(sensitiveProfileFields.map((k) => [k, null])),
              user_id: owner,
              updated_at: new Date().toISOString(),
            })
            .select()
            .single()
        );
        return { ...saved, ...sensitive };
      });
    },
    async migrate(owner) {
      const row = await raw(owner);
      if (!row || !hasData(row)) return false;
      await this.upsert(owner, {});
      return true;
    },
  };
}
export const protectedProfiles = createProtectedProfiles();
