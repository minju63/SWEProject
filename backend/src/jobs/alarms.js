// 때가 된 정책 알림을 알림(notification) 행으로 만든다 (SRS FR-C06~C12). 웹 푸시 전송은 아직 없고,
// 알림 센터에 쌓이는 것까지만 한다. 공용 DB 에 쓰므로 .env 에서 켠 서버 한 곳에서만 돈다.
import { supabase } from '../lib/supabase.js';
import { PRESETS, deadlineAt } from '../services/alarmTime.js';

const BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const labelOf = (code) => PRESETS.find((p) => p.code === code)?.label ?? '직접 정한 시각';

export async function runDueAlarms(now = new Date()) {
  const { data: due, error } = await supabase
    .from('saved_alarm')
    .select(
      'alarm_id, kind, preset_code, fire_at, repeat_daily, bookmark:bookmark_id (user_id, policy:policy_id (policy_id, title, application_end_date, required_documents))'
    )
    .eq('status', 'PENDING')
    .lte('fire_at', now.toISOString())
    .limit(BATCH);
  if (error) throw error;

  let sent = 0;
  for (const alarm of due ?? []) {
    const userId = alarm.bookmark?.user_id;
    const policy = alarm.bookmark?.policy;
    if (!userId || !policy) {
      await supabase
        .from('saved_alarm')
        .update({ status: 'CANCELLED' })
        .eq('alarm_id', alarm.alarm_id);
      continue;
    }

    const { data: pref } = await supabase
      .from('alarm_preference')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (pref?.deadline_enabled === false || pref?.all_enabled === false) {
      await supabase
        .from('saved_alarm')
        .update({ status: 'CANCELLED' })
        .eq('alarm_id', alarm.alarm_id);
      continue;
    }

    // 신청 준비 혜택의 3일 전 알림에는 남은 서류 개수를 함께 알린다 (FR-C12)
    let body = `${policy.title} 마감이 다가왔어요.`;
    if (alarm.preset_code === 'D3' && pref?.doc_reminder_enabled !== false) {
      const { data: app } = await supabase
        .from('user_application')
        .select('stage')
        .eq('user_id', userId)
        .eq('policy_id', policy.policy_id)
        .maybeSingle();
      const total = Array.isArray(policy.required_documents) ? policy.required_documents.length : 0;
      if (app?.stage === 'PREPARING' && total > 0) {
        const { count } = await supabase
          .from('user_document_check')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('policy_id', policy.policy_id)
          .eq('is_checked', true);
        const left = total - (count ?? 0);
        if (left > 0) body += ` 아직 준비하지 못한 서류가 ${left}개 남아 있어요.`;
      }
    }

    const { error: insertError } = await supabase.from('notification').insert({
      user_id: userId,
      policy_id: policy.policy_id,
      alarm_id: alarm.alarm_id,
      type: 'DEADLINE',
      title: `${policy.title} · 마감 ${labelOf(alarm.preset_code)}`,
      body,
      link: `/policies/${policy.policy_id}`,
    });
    if (insertError) {
      console.error('[알림] 보내기 실패:', insertError.message);
      await supabase
        .from('saved_alarm')
        .update({ status: 'FAILED' })
        .eq('alarm_id', alarm.alarm_id);
      continue;
    }
    sent += 1;

    // 매일 반복: 다음 날 같은 시각이 마감 전이면 다시 예약한다 (FR-C11)
    const next = new Date(new Date(alarm.fire_at).getTime() + DAY_MS);
    const deadline = deadlineAt(policy.application_end_date);
    if (alarm.repeat_daily && deadline && next.getTime() <= deadline.getTime()) {
      await supabase
        .from('saved_alarm')
        .update({ fire_at: next.toISOString() })
        .eq('alarm_id', alarm.alarm_id);
    } else {
      await supabase
        .from('saved_alarm')
        .update({ status: 'SENT', sent_at: now.toISOString() })
        .eq('alarm_id', alarm.alarm_id);
    }
  }
  return { due: due?.length ?? 0, sent };
}
