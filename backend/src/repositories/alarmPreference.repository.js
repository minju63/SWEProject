import { supabase } from '../lib/supabase.js';

// 알림 설정(마이 › 알림 설정, FR-MY-009·012~016)
// DB 컬럼 이름과 화면에 주는 이름이 같다. 행이 없으면 기본값을 돌려준다.
export const BOOLEAN_FIELDS = [
  'all_enabled', // 전체 알림 (FR-MY-009)
  'recommend_enabled', // 맞춤 알림 (FR-MY-012, 선택 동의)
  'new_match_enabled', // 정책 알림 (FR-MY-013)
  'event_enabled', // 문화행사 알림 (FR-MY-014)
  'facility_enabled', // 주변 시설 알림 (FR-MY-015)
  'deadline_enabled', // 마감 임박 알림 (FR-MY-016)
];

export const DEFAULTS = {
  all_enabled: true,
  recommend_enabled: false,
  new_match_enabled: true,
  event_enabled: false,
  facility_enabled: false,
  deadline_enabled: true,
};

const pick = (row) =>
  Object.fromEntries(BOOLEAN_FIELDS.map((k) => [k, row?.[k] ?? DEFAULTS[k]]));

export async function find(userId) {
  const { data, error } = await supabase
    .from('alarm_preference')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return pick(data);
}

// 받은 항목만 바꾸고 나머지 설정값은 그대로 둔다 (행이 없으면 만든다)
export async function save(userId, changes) {
  const { data, error } = await supabase
    .from('alarm_preference')
    .upsert({ user_id: userId, ...changes, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return pick(data);
}
