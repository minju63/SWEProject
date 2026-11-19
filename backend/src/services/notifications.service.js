import { supabase } from '../lib/supabase.js';
import { readPersonal, changePersonal } from './my-workspace.service.js';
import { notificationSettings, notificationGroup } from './notification-settings.js';
import { AppError } from '../utils/response.js';
const columns = 'notification_id,type,title,body,link,is_read,created_at,policy_id';
export function createNotifications({
  db = supabase,
  read = readPersonal,
  change = changePersonal,
} = {}) {
  const checked = async (q) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  return {
    async settings(userId) {
      const [personal, pref] = await Promise.all([
        read(userId),
        checked(
          db
            .from('alarm_preference')
            .select('deadline_enabled,new_match_enabled,doc_reminder_enabled')
            .eq('user_id', userId)
            .maybeSingle()
        ),
      ]);
      return notificationSettings({
        ...(pref
          ? {
              deadlines: pref.deadline_enabled,
              recommendations: pref.new_match_enabled,
              applicationUpdates: pref.doc_reminder_enabled,
            }
          : {}),
        ...personal.notificationSettings,
      });
    },
    async saveSettings(userId, input) {
      const value = notificationSettings(input);
      await change(userId, (state) => {
        state.notificationSettings = value;
      });
      return value;
    },
    async list(userId) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [items, unread] = await Promise.all([
        checked(
          db
            .from('notification')
            .select(columns)
            .eq('user_id', userId)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(200)
        ),
        db
          .from('notification')
          .select('notification_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false),
      ]);
      if (unread.error) throw unread.error;
      return {
        items: items.map((n) => ({ ...n, group: notificationGroup(n.type) })),
        unreadCount: unread.count || 0,
      };
    },
    async read(userId, id) {
      if (id !== 'all' && !/^[0-9a-f-]{36}$/i.test(id))
        throw new AppError(400, 'INVALID_NOTIFICATION', '알림을 확인해주세요.');
      let q = db.from('notification').update({ is_read: true }).eq('user_id', userId);
      if (id !== 'all') q = q.eq('notification_id', id);
      await checked(q);
      return {};
    },
  };
}
export const notifications = createNotifications();
