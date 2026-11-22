import PolicyNotFound from '../components/PolicyNotFound'
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAppState } from '../app/AppState'
import {
  accentTheme,
  AppShell,
  PolicyTags,
  ScreenHeader,
  SearchField,
} from '../components/PolicyLayout'
import { findPolicyById, policyCatalog } from '../data/policies'
import { Icon } from './HomeScreen'
const recommendedIds = ['national-youth-savings', 'busan-asset-building', 'youth-future-savings']
export default function PolicyCompareSelectScreen() {
  const { policyId = '' } = useParams()
  const navigate = useNavigate()
  const {
    compareBaseId,
    compareSelectedId,
    compareSearchQuery,
    setCompareBaseId,
    setCompareSelectedId,
    setCompareSearchQuery,
  } = useAppState()
  const baseId = policyId || compareBaseId
  const basePolicy = findPolicyById(baseId)
  const query = compareSearchQuery
  useEffect(() => {
    if (compareBaseId !== baseId) setCompareBaseId(baseId)
  }, [baseId, compareBaseId, setCompareBaseId])
  const policies = useMemo(() => {
    if (!query.trim())
      return policyCatalog
        .filter((p) => p.id !== baseId && p.category === basePolicy?.category)
        .slice(0, 8)
    return policyCatalog.filter(
      (policy) =>
        policy.id !== baseId &&
        `${policy.title} ${policy.category} ${policy.region}`.includes(query.trim())
    )
  }, [query, baseId])
  if (!basePolicy) return <PolicyNotFound title="기준 정책을 찾을 수 없어요." />
  return (
    <AppShell className={accentTheme}>
      <ScreenHeader title="비교할 정책 선택" />
      <main className="pb-32">
        <section className="px-5 pt-5">
          <p className="mb-2 text-[11px] font-extrabold text-[#2468E0]">현재 정책</p>
          <div className="rounded-[22px] border-2 border-[#2F7BF5]/20 bg-white p-5">
            <PolicyTags category={basePolicy.category} region={basePolicy.region} />
            <h2 className="mt-3 text-base font-black">{basePolicy.title}</h2>
            <p className="mt-2 text-[11px] font-semibold text-black/60">
              현재 정책은 변경할 수 없음
            </p>
          </div>
        </section>

        <section className="mt-5 border-y border-black/[0.05] bg-white px-5 py-4">
          <SearchField
            value={query}
            onChange={setCompareSearchQuery}
            onSubmit={() => undefined}
            placeholder="비교할 정책을 검색해보세요"
          />
        </section>

        <section className="px-5 pt-6">
          <div className="flex items-center gap-2">
            {!query && (
              <span className="grid size-7 place-items-center rounded-lg bg-[#EAF2FE] text-[#2468E0]">
                <Icon name="sparkle" className="size-4" />
              </span>
            )}
            <h2 className="text-lg font-black">{query ? '검색 결과' : 'AI 추천 정책'}</h2>
            <span className="text-xs font-bold text-black/30">{policies.length}건</span>
          </div>
          <div className="mt-4 space-y-3">
            {policies.map(
              (policy) =>
                policy && (
                  <article
                    key={policy.id}
                    className="flex items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_5px_18px_rgba(23,25,35,0.03)]"
                  >
                    <button
                      onClick={() => setCompareSelectedId(policy.id)}
                      className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${
                        compareSelectedId === policy.id
                          ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
                          : 'border-black/15 bg-white text-transparent'
                      }`}
                      aria-label={`${policy.title} 비교 대상으로 선택`}
                    >
                      ✓
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black">{policy.title}</h3>
                      <div className="mt-2">
                        <PolicyTags category={policy.category} region={policy.region} />
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/policies/${policy.id}`)}
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f5f6f8] text-black/60"
                      aria-label={`${policy.title} 상세보기`}
                    >
                      <svg
                        className="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </article>
                )
            )}
            {policies.length === 0 && (
              <div className="rounded-[20px] bg-white py-12 text-center">
                <p className="text-sm font-black">검색 결과가 없어요</p>
                <p className="mt-1 text-xs text-black/60">다른 정책명이나 키워드를 입력해주세요.</p>
              </div>
            )}
          </div>
        </section>
      </main>
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-black/[0.06] bg-white/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <button
          disabled={!compareSelectedId}
          onClick={() => navigate(`/policies/${baseId}/compare/${compareSelectedId}`)}
          className="w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white disabled:bg-black/10 disabled:text-black/30"
        >
          {compareSelectedId ? '선택한 정책과 비교하기' : '비교할 정책을 선택해주세요'}
        </button>
      </div>
    </AppShell>
  )
}
