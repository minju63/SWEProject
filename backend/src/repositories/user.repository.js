import { supabase } from '../lib/supabase.js';
import { ensureDefaultBookmarkAlarms } from '../services/bookmark-alarm.service.js';

export async function findProfile(userId) {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile(userId, profile) {
  const { data, error } = await supabase
    .from('user_profile')
    .upsert({ ...profile, user_id: userId, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findBookmarks(userId) {
  const { data, error } = await supabase
    .from('user_bookmark')
    .select(
      'bookmark_id, created_at, policy:policy_id (policy_id, title, support_summary, application_end_date, is_always_open)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function findBookmarkedPolicyIds(userId, policyIds) {
  if (!policyIds.length) return new Set();
  const { data, error } = await supabase.from('user_bookmark')
    .select('policy_id').eq('user_id', userId).in('policy_id', policyIds);
  if (error) throw error;
  return new Set(data.map((row) => row.policy_id));
}

export async function insertBookmark(userId, policyId, savedFrom) {
  const { data, error } = await supabase
    .from('user_bookmark')
    .upsert(
      { user_id: userId, policy_id: policyId, saved_from: savedFrom ?? null },
      { onConflict: 'user_id,policy_id', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  try {
    await ensureDefaultBookmarkAlarms(userId, data);
  } catch (alarmError) {
    console.error('기본 찜 알림을 생성하지 못했습니다.', alarmError);
  }
  return data;
}

export async function deleteBookmark(userId, policyId) {
  const { error } = await supabase
    .from('user_bookmark')
    .delete()
    .eq('user_id', userId)
    .eq('policy_id', policyId);
  if (error) throw error;
}

export async function recordRecentView(userId, policyId) {
  const { error } = await supabase.from('user_recent_view').upsert({
    user_id: userId,
    policy_id: policyId,
    viewed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,policy_id' });
  if (error) throw error;
}
