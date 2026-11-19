import { supabase } from '../lib/supabase.js';

const POLICY_COLUMNS =
  'policy_id, title, category_id, application_end_date, is_always_open, required_documents';

export async function findBookmarks(userId) {
  const { data, error } = await supabase
    .from('user_bookmark')
    .select(`bookmark_id, created_at, policy:policy_id (${POLICY_COLUMNS})`)
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function findApplications(userId) {
  const { data, error } = await supabase
    .from('user_application')
    .select(
      `application_id, stage, applied_at, expected_result_date, policy:policy_id (${POLICY_COLUMNS})`
    )
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function findStatuses(policyIds) {
  if (policyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('v_policy_status')
    .select('policy_id, recruitment_status, d_day')
    .in('policy_id', policyIds);
  if (error) throw error;
  return data;
}

export async function findRegionNames(policyIds) {
  if (policyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('policy_region')
    .select('policy_id, region:region_code (region_name)')
    .in('policy_id', policyIds);
  if (error) throw error;
  return data;
}

export async function findAlarmsByBookmarks(bookmarkIds) {
  if (bookmarkIds.length === 0) return [];
  const { data, error } = await supabase
    .from('saved_alarm')
    .select('alarm_id, bookmark_id, kind, preset_code, fire_at, repeat_daily, status')
    .in('bookmark_id', bookmarkIds)
    .eq('status', 'PENDING')
    .order('fire_at');
  if (error) throw error;
  return data;
}

export async function findBookmarkOf(userId, policyId) {
  const { data, error } = await supabase
    .from('user_bookmark')
    .select(`bookmark_id, policy:policy_id (${POLICY_COLUMNS})`)
    .eq('user_id', userId)
    .eq('policy_id', policyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findPreference(userId) {
  const { data, error } = await supabase
    .from('alarm_preference')
    .select('default_presets, day_alarm_time, deadline_enabled, doc_reminder_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findDocCheckedCount(userId, policyId) {
  const { count, error } = await supabase
    .from('user_document_check')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('policy_id', policyId)
    .eq('is_checked', true);
  if (error) throw error;
  return count ?? 0;
}

// 이 찜의 알림을 통째로 바꾼다: 대기 중인 알림과, 새로 넣을 프리셋과 겹치는 옛 알림을 지우고 새로 넣는다
export async function replaceAlarms(bookmarkId, rows) {
  const del1 = await supabase
    .from('saved_alarm')
    .delete()
    .eq('bookmark_id', bookmarkId)
    .eq('status', 'PENDING')
    .in('kind', ['PRESET', 'CUSTOM']);
  if (del1.error) throw del1.error;
  const codes = rows.filter((r) => r.kind === 'PRESET').map((r) => r.preset_code);
  if (codes.length) {
    const del2 = await supabase
      .from('saved_alarm')
      .delete()
      .eq('bookmark_id', bookmarkId)
      .eq('kind', 'PRESET')
      .in('preset_code', codes);
    if (del2.error) throw del2.error;
  }
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from('saved_alarm').insert(rows).select();
  if (error) throw error;
  return data;
}

// 같은 프리셋이 이미 있으면 건드리지 않는다 (찜할 때 기본 알림 넣기)
export async function insertPresetAlarmsIfMissing(rows) {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('saved_alarm')
    .upsert(rows, { onConflict: 'bookmark_id,preset_code', ignoreDuplicates: true });
  if (error) {
    // 부분 유니크 인덱스라 upsert 가 안 되는 환경이면 하나씩 넣고 중복은 넘어간다
    for (const row of rows) {
      const one = await supabase.from('saved_alarm').insert(row);
      if (one.error && one.error.code !== '23505') throw one.error;
    }
  }
}

export async function findAlarmWithOwner(alarmId) {
  const { data, error } = await supabase
    .from('saved_alarm')
    .select('alarm_id, bookmark:bookmark_id (user_id)')
    .eq('alarm_id', alarmId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAlarm(alarmId) {
  const { error } = await supabase.from('saved_alarm').delete().eq('alarm_id', alarmId);
  if (error) throw error;
}
