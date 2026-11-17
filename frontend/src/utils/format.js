export const ELIGIBILITY_LABEL = {
  ELIGIBLE: { text: '✓ 신청 가능', className: 'badge badge-ok' },
  CHECK: { text: '! 확인 필요', className: 'badge badge-check' },
  INELIGIBLE: { text: '✕ 대상 아님', className: 'badge badge-no' },
};

export function ageFromBirthDate(value, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const today = Object.fromEntries(parts.map(({ type, value: part }) => [type, Number(part)]));
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function dDayText(dDay, status) {
  if (status === '상시') return '상시';
  if (dDay == null) return status ?? '';
  if (dDay < 0) return '마감';
  return dDay === 0 ? 'D-day' : `D-${dDay}`;
}
