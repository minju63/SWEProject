import { supabase } from '../lib/supabase.js';
import { calculatePolicyStatus } from './policy-status.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_PRESETS = ['D1', 'M30'];
const DAY_PRESETS = { W1: 7, D3: 3, D1: 1, DDAY_AM: 0 };
const MINUTE_PRESETS = { H3: 180, H1: 60, M30: 30, M10: 10 };

export function presetFireAt(code, endDate, dayAlarmTime = '09:00:00') {
  const status = calculatePolicyStatus({ application_end_date: endDate, is_always_open: false });
  if (!status.deadline_at) return null;
  const end = Date.parse(status.deadline_at);
  if (Object.hasOwn(MINUTE_PRESETS, code))
    return new Date(end - MINUTE_PRESETS[code] * MINUTE_MS).toISOString();
  if (!Object.hasOwn(DAY_PRESETS, code)) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(dayAlarmTime);
  const hours = match ? Number(match[1]) : 9;
  const minutes = match ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  const midnight = Date.parse(`${endDate}T00:00:00Z`) - KST_OFFSET_MS;
  return new Date(midnight - DAY_PRESETS[code] * DAY_MS + hours * 60 * MINUTE_MS + minutes * MINUTE_MS).toISOString();
}

export async function ensureDefaultBookmarkAlarms(userId, bookmark) {
  const [policyResult, preferenceResult, alarmResult] = await Promise.all([
    supabase.from('policy').select('application_end_date,is_always_open')
      .eq('policy_id', bookmark.policy_id).maybeSingle(),
    supabase.from('alarm_preference').select('*')
      .eq('user_id', userId).maybeSingle(),
    supabase.from('saved_alarm').select('preset_code').eq('bookmark_id', bookmark.bookmark_id)
      .eq('kind', 'PRESET'),
  ]);
  for (const result of [policyResult, preferenceResult, alarmResult]) {
    if (result.error) throw result.error;
  }
  const policy = policyResult.data;
  if (!policy?.application_end_date || policy.is_always_open || preferenceResult.data?.deadline_enabled === false || preferenceResult.data?.all_enabled === false)
    return;

  const presets = preferenceResult.data?.default_presets ?? DEFAULT_PRESETS;
  const existing = new Set(alarmResult.data.map((item) => item.preset_code));
  const now = Date.now();
  const rows = [...new Set(presets)].filter((code) => !existing.has(code)).map((code) => ({
    bookmark_id: bookmark.bookmark_id,
    kind: 'PRESET',
    preset_code: code,
    fire_at: presetFireAt(code, policy.application_end_date, preferenceResult.data?.day_alarm_time),
  })).filter((row) => row.fire_at && Date.parse(row.fire_at) > now);
  if (!rows.length) return;
  const { error } = await supabase.from('saved_alarm').insert(rows);
  if (error && error.code !== '23505') throw error;
}
