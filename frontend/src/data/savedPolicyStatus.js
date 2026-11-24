const DAY_MS = 86400000

function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null
}

export function savedPolicyStatus(policy, now = new Date()) {
  if (!policy) return null
  const today = dateNumber(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now))
  const start = dateNumber(policy.applicationStartDate)
  const end = dateNumber(policy.applicationEndDate)
  if (policy.isAlwaysOpen) return '신청 가능'
  if (end != null && end < today) return '마감'
  if (start != null && start > today) return null
  if (end != null) return end - today <= 7 * DAY_MS ? '마감 임박' : '신청 가능'
  if (start != null) return '신청 가능'
  if (['마감', '마감됨', '종료'].includes(policy.recruitmentStatus ?? policy.status)) return '마감'
  if (['모집 중', '상시', '신청 가능'].includes(policy.recruitmentStatus ?? policy.status)) return '신청 가능'
  // Without dates, a stored urgency label may be stale, so do not infer D-day.
  return null
}
