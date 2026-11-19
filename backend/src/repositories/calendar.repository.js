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

// 이 찜(또는 신청 준비)의 알림을 통째로 바꾼다: 대기 중인 알림과, 새로 넣을 프리셋과 겹치는 옛 알림을 지우고 새로 넣는다.
// column: 'bookmark_id' | 'application_id'
export async function replaceAlarms(column, ownerId, rows) {
  const del1 = await supabase
    .from('saved_alarm')
    .delete()
    .eq(column, ownerId)
    .eq('status', 'PENDING')
    .in('kind', ['PRESET', 'CUSTOM']);
  if (del1.error) throw del1.error;
  const codes = rows.filter((r) => r.kind === 'PRESET').map((r) => r.preset_code);
  if (codes.length) {
    const del2 = await supabase
      .from('saved_alarm')
      .delete()
      .eq(column, ownerId)
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
export async function insertPresetAlarmsIfMissing(rows, column = 'bookmark_id') {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('saved_alarm')
    .upsert(rows, { onConflict: `${column},preset_code`, ignoreDuplicates: true });
  if (error) {
    // 부분 유니크 인덱스라 upsert 가 안 되는 환경이면 하나씩 넣고 중복은 넘어간다
    for (const row of rows) {
      const one = await supabase.from('saved_alarm').insert(row);
      if (one.error && one.error.code !== '23505') throw one.error;
    }
  }
}

export async function findAlarmWithOwner(alarmId) {
  // 신청 준비 알림(application_id)을 쓰려면 migrations/20261119_application_alarms.sql 이 필요하다. 없으면 찜 알림만 본다
  const withApp = await supabase
    .from('saved_alarm')
    .select('alarm_id, bookmark:bookmark_id (user_id), application:application_id (user_id)')
    .eq('alarm_id', alarmId)
    .maybeSingle();
  if (!withApp.error) return withApp.data;
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

// 이 사용자의 서류 체크 행 전체 (공식 준비물 체크 + 직접 추가한 준비물)
export async function findDocumentRows(userId) {
  const { data, error } = await supabase
    .from('user_document_check')
    .select('policy_id, doc_key, is_checked')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

// 신청 준비 정책: 이 사용자의 신청 건 하나
export async function findApplicationOf(userId, policyId) {
  const { data, error } = await supabase
    .from('user_application')
    .select(`application_id, stage, policy:policy_id (${POLICY_COLUMNS})`)
    .eq('user_id', userId)
    .eq('policy_id', policyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 신청 준비 알림. 마이그레이션 전에는 컬럼이 없어 빈 목록으로 본다
export async function findAlarmsByApplications(applicationIds) {
  if (applicationIds.length === 0) return [];
  const { data, error } = await supabase
    .from('saved_alarm')
    .select('alarm_id, application_id, kind, preset_code, fire_at, repeat_daily, status')
    .in('application_id', applicationIds)
    .eq('status', 'PENDING')
    .order('fire_at');
  if (error) return [];
  return data;
}

// 신청 준비를 벗어나면(신청 완료 등) 대기 중인 알림을 취소한다 (FR-COM-04)
export async function cancelApplicationAlarms(applicationId) {
  const { error } = await supabase
    .from('saved_alarm')
    .update({ status: 'CANCELLED' })
    .eq('application_id', applicationId)
    .eq('status', 'PENDING');
  if (error && !/application_id/.test(error.message ?? '')) throw error;
}

// 찜에 붙어 있던 기본(프리셋) 알림을 취소한다: 신청 준비 기준만 적용하기 위해 (FR-COM-04)
export async function cancelBookmarkPresetAlarms(bookmarkId) {
  const { error } = await supabase
    .from('saved_alarm')
    .update({ status: 'CANCELLED' })
    .eq('bookmark_id', bookmarkId)
    .eq('kind', 'PRESET')
    .eq('status', 'PENDING');
  if (error) throw error;
}
