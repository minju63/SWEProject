// 때가 된 정책 알림을 알림(notification) 행으로 만든다 (SRS FR-C06~C12). 웹 푸시 전송은 아직 없고,
// 알림 센터에 쌓이는 것까지만 한다. 공용 DB 에 쓰므로 .env 에서 켠 서버 한 곳에서만 돈다.
import { supabase } from '../lib/supabase.js';
import { PRESETS, deadlineAt } from '../services/alarmTime.js';
import { notifications } from '../services/notifications.service.js';
import { buildDocuments } from '../services/documents.js';

const BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const labelOf = (code) => PRESETS.find((p) => p.code === code)?.label ?? '직접 정한 시각';

export async function runDueAlarms(now = new Date()) {
  const policyEmbed = 'policy:policy_id (policy_id, title, application_end_date, required_documents)';
  const dueQuery = (select) =>
    supabase
      .from('saved_alarm')
      .select(select)
      .eq('status', 'PENDING')
      .lte('fire_at', now.toISOString())
      .limit(BATCH);
  // 신청 준비 알림(application_id)은 migrations/20261119_application_alarms.sql 실행 뒤에 있다. 그 전에는 찜 알림만 처리한다
  let { data: due, error } = await dueQuery(
    `alarm_id, kind, preset_code, fire_at, repeat_daily, bookmark:bookmark_id (user_id, ${policyEmbed}), application:application_id (user_id, ${policyEmbed})`
  );
  if (error)
    ({ data: due, error } = await dueQuery(
      `alarm_id, kind, preset_code, fire_at, repeat_daily, bookmark:bookmark_id (user_id, ${policyEmbed})`
    ));
  if (error) throw error;

  let sent = 0;
  const settingsByUser = new Map();
  for (const alarm of due ?? []) {
    const owner = alarm.bookmark ?? alarm.application; // 찜 또는 신청 준비
    const userId = owner?.user_id;
    const policy = owner?.policy;
    if (!userId || !policy) {
      await supabase
        .from('saved_alarm')
        .update({ status: 'CANCELLED' })
        .eq('alarm_id', alarm.alarm_id);
      continue;
    }
    if (!settingsByUser.has(userId))
      settingsByUser.set(userId, await notifications.settings(userId));
    const settings = settingsByUser.get(userId);
    if (!settings.enabled || !settings.deadlines) {
      // Keep every individual preference; discard only this suppressed delivery.
      await supabase
        .from('saved_alarm')
        .update({ status: 'CANCELLED' })
        .eq('alarm_id', alarm.alarm_id);
      continue;
    }

    const { data: pref } = await supabase
      .from('alarm_preference')
      .select('deadline_enabled, doc_reminder_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    // 신청 준비 중인 정책의 알림에는 아직 준비하지 못한 신청 준비물 이름을 함께 알린다 (찜만 한 정책은 알리지 않는다)
    let body = `${policy.title} 마감이 다가왔어요.`;
    if (pref?.doc_reminder_enabled !== false) {
      const { data: app } = await supabase
        .from('user_application')
        .select('stage')
        .eq('user_id', userId)
        .eq('policy_id', policy.policy_id)
        .maybeSingle();
      if (app?.stage === 'PREPARING') {
        const { data: rows } = await supabase
          .from('user_document_check')
          .select('doc_key, is_checked')
          .eq('user_id', userId)
          .eq('policy_id', policy.policy_id);
        const left = buildDocuments(policy, rows ?? []).filter((d) => !d.checked);
        if (left.length > 0) {
          const shown = left.slice(0, 5).map((d) => d.name);
          body += ` 아직 준비하지 못한 신청 준비물: ${shown.join(', ')}${
            left.length > shown.length ? ` 외 ${left.length - shown.length}개` : ''
          }.`;
        }
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
