export function workspaceEvents(saved, applications, policies) {
  const events = new Map()
  const put = (id, policyId, title, date, kind) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) events.set(id, { id, policyId, title, date, kind })
  }
  for (const id of saved) {
    const p = policies.find((p) => p.id === id)
    if (p?.applicationEndDate) put(id + ':deadline', id, p.title, p.applicationEndDate, '신청 마감')
  }
  for (const a of applications) {
    const policyId = a.policyId.startsWith('manual-') ? undefined : a.policyId
    if (a.stage === '신청 준비')
      put(a.policyId + ':deadline', policyId, a.policyName, a.applicationDeadline, '신청 마감')
    else events.delete(a.policyId + ':deadline')
    if (a.applicationDate)
      put(a.id + ':applied', policyId, a.policyName, a.applicationDate, '신청 완료')
    if (a.expectedResultDate)
      put(a.id + ':result', policyId, a.policyName, a.expectedResultDate, '결과 발표')
  }
  return [...events.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko')
  )
}
