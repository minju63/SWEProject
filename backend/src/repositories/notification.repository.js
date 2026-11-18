import { supabase } from '../lib/supabase.js';

const COLUMNS = 'notification_id, policy_id, type, title, body, link, is_read, created_at';

// 최근 N일 알림 (최신순)
export async function findRecent(userId, { days = 30, limit = 200 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('notification')
    .select(COLUMNS)
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function countUnread(userId) {
  const { count, error } = await supabase
    .from('notification')
    .select('notification_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

// 본인 알림만 읽음 처리한다
export async function markRead(userId, notificationId) {
  const { error } = await supabase
    .from('notification')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('notification_id', notificationId);
  if (error) throw error;
}

export async function markAllRead(userId) {
  const { error } = await supabase
    .from('notification')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}
