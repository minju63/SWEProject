export const ELIGIBILITY_LABEL = {
  ELIGIBLE: { text: '✓ 신청 가능', className: 'badge badge-ok' },
  CHECK: { text: '! 확인 필요', className: 'badge badge-check' },
  INELIGIBLE: { text: '✕ 대상 아님', className: 'badge badge-no' },
};

export function dDayText(dDay, status) {
  if (status === '상시') return '상시';
  if (dDay == null) return status ?? '';
  if (dDay < 0) return '마감';
  return dDay === 0 ? 'D-day' : `D-${dDay}`;
}
