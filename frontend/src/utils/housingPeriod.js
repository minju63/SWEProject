const labels = {
  '지원 유형별 신청기간 다름': '유형별 확인',
  '개인별 신청기한': '개별 기한',
  '주택별 모집공고 확인': '공고별 확인',
  '매월 신청': '매월 접수',
  '예산 소진 시 마감': '예산 확인',
  '상담 운영시간 확인': '운영시간 확인',
  '접수처 확인 필요': '접수처 확인',
};

/** Presentation only: never changes recruitment status or eligibility. */
export function housingPeriodLabel(policy) {
  if (policy.collection_domain !== 'HOUSING' || policy.is_always_open ||
      policy.application_start_date || policy.application_end_date) return undefined;
  const heading = policy.application_period_unknown_reason?.trim().split('\n')[0];
  return labels[heading];
}
