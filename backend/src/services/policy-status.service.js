const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_NOTICE = '마감 시각 미기재, 원문 확인 필요';

export function kstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  return { year: values.year, month: values.month, day: values.day };
}

function dateNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const number = Date.UTC(year, month - 1, day);
  const date = new Date(number);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? number : null;
}

export function calculatePolicyStatus(policy, now = new Date()) {
  if (policy.is_always_open) return { recruitment_status: '상시', d_day: null, deadline_at: null, deadline_time_notice: null };

  const startDay = dateNumber(policy.application_start_date);
  const endDay = dateNumber(policy.application_end_date);
  const { year, month, day } = kstDateParts(now);
  const today = Date.UTC(year, month - 1, day);
  const startAt = startDay == null ? null : startDay - KST_OFFSET_MS;
  const endAt = endDay == null ? null : endDay - KST_OFFSET_MS + 23 * 60 * 60 * 1000 + 59 * 60 * 1000;
  const recruitmentStatus = startAt != null && now.getTime() < startAt ? '모집 예정'
    : endAt != null && now.getTime() > endAt ? '마감'
      : startAt == null && endAt == null ? '기간 미정' : '모집 중';

  return {
    recruitment_status: recruitmentStatus,
    d_day: endDay == null ? null : recruitmentStatus === '마감' && endDay === today
      ? -1 : (endDay - today) / DAY_MS,
    deadline_at: endAt == null ? null : new Date(endAt).toISOString(),
    deadline_time_notice: endAt == null ? null : DEADLINE_NOTICE,
  };
}

// 행사 일정은 별도 시각 컬럼을 사용하는 기존 DB 뷰의 상태를 유지한다.
export function policyStatus(policy, viewStatus = {}) {
  return policy.item_type === 'POLICY' ? calculatePolicyStatus(policy) : viewStatus;
}
