import { mapHousingPolicy } from './housing'
export const catalogEvents = []
export async function fetchPolicyCatalog() {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
  const response = await fetch(base + '/policy-catalog', {
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw Error('정책 정보를 불러오지 못했어요.')
  const result = await response.json()
  if (
    !result.success ||
    !Array.isArray(result.data?.policies) ||
    !Array.isArray(result.data?.events)
  )
    throw Error('정책 응답을 확인할 수 없어요.')
  const ids = new Set()
  for (const row of [...result.data.policies, ...result.data.events]) {
    if (ids.has(row.policy_id)) throw Error('중복 정책 응답')
    ids.add(row.policy_id)
  }
  if (ids.size !== result.data.totalCount) throw Error('정책 응답이 일부 누락됐어요.')
  catalogEvents.splice(0, catalogEvents.length, ...result.data.events)
  return result.data.policies.map(mapHousingPolicy)
}
