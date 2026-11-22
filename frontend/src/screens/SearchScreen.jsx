import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAppState } from '../app/AppState'
import AppSelect from '../components/AppSelect'
import InterestAccordion from '../components/InterestAccordion'
import {
  accentTheme,
  AppShell,
  BackButton,
  BottomNav,
  PolicyTags,
  SearchField,
} from '../components/PolicyLayout'
import { policyCatalog } from '../data/policies'
import { evaluateEligibility, recommendedSort } from '../data/eligibility'
import { searchCategories, subCategoryTree } from '../data/searchFilter'
import {
  AppliedConditionsSheet,
  Collapse,
  ConditionFields,
  ConditionSummaryStrip,
  ConditionToggleButton,
} from '../components/ConditionFilter'
import {
  conditionCount,
  emptyConditions,
  orderedConditions,
  profileToConditions,
  sameConditions,
  summarize,
} from '../data/conditions'
import { Icon } from './HomeScreen'
import { DragScroll } from './minju/DragScroll'
const categories = searchCategories
const regions = [
  '중구',
  '서구',
  '동구',
  '영도구',
  '부산진구',
  '동래구',
  '남구',
  '북구',
  '해운대구',
  '사하구',
  '금정구',
  '강서구',
  '연제구',
  '수영구',
  '사상구',
  '기장군',
]
const wideRegions = ['전국', '부산시', '부산 전체']
const isAllRegions = (selected) =>
  selected.length === 0 || regions.every((region) => selected.includes(region))
const statuses = ['모집 중', '7일 내 마감', '상시', '모집 예정', '마감']
function toggleItem(items, item) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}
function matchesQuery(searchText, query) {
  const words = query.trim().split(/\s+/).filter(Boolean)
  return words.length === 0 || words.some((word) => searchText.includes(word))
}
const customOf = (c, profileConditions) =>
  sameConditions(c, profileConditions) ? emptyConditions : c
// 대분류만 고르거나 세부분류를 모두 고르면 대분류 전체, 일부만 고르면 해당 세부분류 정책만
function matchesCategory(policy, categories, details) {
  if (categories.length === 0) return true
  if (!categories.includes(policy.category)) return false
  const subs = subCategoryTree[policy.category] ?? []
  const picked = subs.filter((item) => details.includes(item))
  if (picked.length === 0 || picked.length === subs.length) return true
  return (policy.subCategories ?? []).some((item) => picked.includes(item))
}
// 대분류가 선택돼 있고 세부분류가 비어 있으면 세부분류를 모두 선택한 상태로 맞춰 UI에 표시
function normalizeSelection(categories, details) {
  const valid = categories.filter((item) => searchCategories.includes(item))
  const next = [...details]
  valid.forEach((category) => {
    const subs = subCategoryTree[category] ?? []
    if (subs.length && !subs.some((item) => next.includes(item))) next.push(...subs)
  })
  return { categories: valid, details: next }
}
function filterPolicies(filters, query, conditions, profileConditions, profileRegion) {
  return policyCatalog.filter((policy) => {
    if (policy.itemType === 'EVENT') return false
    const searchText = `${policy.title} ${policy.description} ${policy.category} ${policy.target} ${policy.benefit} ${policy.organization}`
    const queryMatches = matchesQuery(searchText, query)
    const categoryMatches = matchesCategory(policy, filters.categories, filters.categoryDetails)
    const regionMatches =
      isAllRegions(filters.regions) ||
      wideRegions.includes(policy.region) ||
      filters.regions.includes(policy.region)
    const normalizedStatuses = filters.statuses.map((status) =>
      status === '마감' ? '마감됨' : status
    )
    const statusMatches =
      filters.statuses.length === 0 || normalizedStatuses.includes(policy.recruitmentStatus)
    const alwaysOpen = policy.recruitmentStatus === '상시'
    const dateMatches =
      !(filters.dateStart || filters.dateEnd) ||
      (alwaysOpen
        ? filters.includeAlways
        : (!filters.dateStart ||
            !policy.applicationEndDate ||
            policy.applicationEndDate >= filters.dateStart) &&
          (!filters.dateEnd ||
            !policy.applicationStartDate ||
            policy.applicationStartDate <= filters.dateEnd))
    const conditionMatches = filters.myConditionsOnly
      ? (policy.region === '전국' ||
          (['부산시', '부산 전체'].includes(policy.region) && profileRegion.startsWith('부산')) ||
          profileRegion.endsWith(policy.region)) &&
        evaluateEligibility(policy, profileConditions, profileRegion).overall !== '대상 아님'
      : evaluateEligibility(policy, customOf(conditions, profileConditions), '').overall !==
        '대상 아님'
    return (
      queryMatches &&
      categoryMatches &&
      regionMatches &&
      statusMatches &&
      dateMatches &&
      conditionMatches
    )
  })
}
export default function SearchScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    savedPolicies,
    toggleSaved,
    addRecent,
    policySearch,
    setPolicySearch,
    recentSearchTerms,
    addRecentSearchTerm,
    clearRecentSearchTerms,
    temporaryPolicyConditions,
    setTemporaryPolicyConditions,
    profile,
  } = useAppState()
  const profileConditions = useMemo(() => profileToConditions(profile), [profile])
  useEffect(() => {
    sessionStorage.setItem(
      'youthzip-last-search',
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    )
  }, [searchParams])
  const routeQuery = searchParams.get('q') ?? ''
  const rawCategory = searchParams.get('category') ?? ''
  const routeCategory = searchCategories.includes(rawCategory) ? rawCategory : ''
  const hasSearch =
    searchParams.has('q') || searchParams.has('category') || searchParams.has('results')
  const [queryInput, setQueryInput] = useState(routeQuery || policySearch.query)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(null)
  const sheetRef = useRef(null)
  const sheetDrag = useRef(null)
  const [subFilter, setSubFilter] = useState(null)
  const [draftConditions, setDraftConditions] = useState(temporaryPolicyConditions)
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const [appliedSheetOpen, setAppliedSheetOpen] = useState(false)
  const [draft, setDraft] = useState({
    categories: routeCategory ? [routeCategory] : policySearch.categories,
    categoryDetails: policySearch.categoryDetails ?? [],
    regions: policySearch.regions,
    statuses: policySearch.statuses,
    facilityTypes: policySearch.facilityTypes,
    dateStart: policySearch.dateStart,
    dateEnd: policySearch.dateEnd,
    includeAlways: policySearch.includeAlways,
    myConditionsOnly: policySearch.myConditionsOnly,
  })
  const appliedFilters = {
    categories: (routeCategory ? [routeCategory] : policySearch.categories).filter((item) =>
      searchCategories.includes(item)
    ),
    categoryDetails: routeCategory ? [] : (policySearch.categoryDetails ?? []),
    regions: policySearch.regions,
    statuses: policySearch.statuses,
    facilityTypes: policySearch.facilityTypes,
    dateStart: policySearch.dateStart,
    dateEnd: policySearch.dateEnd,
    includeAlways: policySearch.includeAlways,
    myConditionsOnly: policySearch.myConditionsOnly,
  }
  const customConditions = customOf(temporaryPolicyConditions, profileConditions)
  const customCount = conditionCount(customConditions)
  const rankingUser =
    appliedFilters.myConditionsOnly || customCount === 0 ? profileConditions : customConditions
  const results = useMemo(() => {
    const filtered = filterPolicies(
      appliedFilters,
      routeQuery,
      temporaryPolicyConditions,
      profileConditions,
      profile.region
    )
    if (policySearch.sort === '마감 임박순') {
      const day = (value) => (value.startsWith('D-') ? Number(value.slice(2)) : 999)
      return [...filtered].sort((a, b) => day(a.deadline) - day(b.deadline))
    }
    if (policySearch.sort === '최신순') {
      return [...filtered].sort((a, b) => b.publishedOrder - a.publishedOrder)
    }
    return recommendedSort(filtered, rankingUser, profile.region)
  }, [
    routeQuery,
    routeCategory,
    policySearch,
    temporaryPolicyConditions,
    profileConditions,
    profile.region,
  ])
  const draftResults = useMemo(
    () =>
      filterPolicies(draft, routeQuery, draftConditions, profileConditions, profile.region).length,
    [draft, draftConditions, routeQuery, profileConditions, profile.region]
  )
  const appliedChips = [
    ...appliedFilters.categories.flatMap((category) => {
      const subs = subCategoryTree[category] ?? []
      const picked = subs.filter((item) => appliedFilters.categoryDetails.includes(item))
      return picked.length > 0 && picked.length < subs.length
        ? picked.map((value) => ({ type: 'categoryDetails', value, category }))
        : [{ type: 'categories', value: category, category }]
    }),
    ...(isAllRegions(appliedFilters.regions)
      ? []
      : appliedFilters.regions.map((value) => ({
          type: 'regions',
          value,
          category: '',
        }))),
    ...appliedFilters.statuses.map((value) => ({
      type: 'statuses',
      value,
      category: '',
    })),
    ...(appliedFilters.dateStart || appliedFilters.dateEnd
      ? [{ type: 'date', value: '신청 기간', category: '' }]
      : []),
  ]
  const filterCount = [
    appliedFilters.categories.length > 0,
    !isAllRegions(appliedFilters.regions),
    appliedFilters.statuses.length > 0,
    Boolean(appliedFilters.dateStart || appliedFilters.dateEnd),
    appliedFilters.myConditionsOnly,
    !appliedFilters.myConditionsOnly && customCount > 0,
  ].filter(Boolean).length
  function submitSearch(term = queryInput) {
    const query = term.trim()
    if (query) addRecentSearchTerm(query)
    setQueryInput(query)
    setPolicySearch({ query })
    const next = new URLSearchParams()
    next.set('results', '1')
    if (query) next.set('q', query)
    setSearchParams(next)
  }
  function browseCategory(category) {
    setPolicySearch({ categories: [category], categoryDetails: [], query: '' })
    setDraft((current) => ({ ...current, categories: [category], categoryDetails: [] }))
    setSearchParams({ category })
  }
  function removeFilter(type, value, category = '') {
    if (type === 'date') {
      setPolicySearch({ dateStart: '', dateEnd: '' })
      return
    }
    if (type === 'categories' || type === 'categoryDetails') {
      const subs = subCategoryTree[category] ?? []
      const remainingDetails = appliedFilters.categoryDetails.filter((item) =>
        type === 'categories' ? !subs.includes(item) : item !== value
      )
      const keep =
        type === 'categoryDetails' && subs.some((item) => remainingDetails.includes(item))
      setPolicySearch({
        categories: keep
          ? appliedFilters.categories
          : appliedFilters.categories.filter((item) => item !== category),
        categoryDetails: remainingDetails,
      })
      if (!keep && category === routeCategory) {
        const params = new URLSearchParams(searchParams)
        params.delete('category')
        params.set('results', '1')
        setSearchParams(params)
      }
      return
    }
    const next = appliedFilters[type].filter((item) => item !== value)
    setPolicySearch({ [type]: next })
  }
  function openFilters(expandConditions = false) {
    const selection = normalizeSelection(appliedFilters.categories, appliedFilters.categoryDetails)
    setDraft({
      ...appliedFilters,
      categories: selection.categories,
      categoryDetails: selection.details,
    })
    setDraftConditions(customOf(temporaryPolicyConditions, profileConditions))
    setConditionsOpen(expandConditions)
    setSheetHeight(null)
    setAppliedSheetOpen(false)
    setSheetOpen(true)
  }
  function applyFilters() {
    setPolicySearch(draft)
    setTemporaryPolicyConditions(draftConditions)
    const params = new URLSearchParams(searchParams)
    params.delete('category')
    params.set('results', '1')
    setSearchParams(params)
    setSheetOpen(false)
  }
  function resetDraft() {
    setDraft({
      categories: [],
      categoryDetails: [],
      regions: [],
      statuses: [],
      facilityTypes: [],
      dateStart: '',
      dateEnd: '',
      includeAlways: false,
      myConditionsOnly: false,
    })
    setDraftConditions(emptyConditions)
  }
  if (!hasSearch) {
    return (
      <AppShell className={accentTheme}>
        <header className="sticky top-0 z-40 bg-white/95 px-5 pb-4 pt-3 backdrop-blur-xl">
          <div className="flex h-11 items-center gap-2">
            <BackButton onClick={() => navigate('/')} />
            <h1 className="text-[17px] font-black tracking-[-0.03em]">정책 찾기</h1>
          </div>
          <div className="mt-3">
            <SearchField
              value={queryInput}
              onChange={setQueryInput}
              onSubmit={() => submitSearch()}
              placeholder="정책명 또는 키워드를 입력해주세요"
              buttonLabel="검색"
            />
          </div>
        </header>
        <main className="px-4 pb-28 pt-4">
          <div className="rounded-[24px] bg-white p-4 shadow-[0_5px_18px_rgba(23,25,35,0.035)]">
            <section>
              <h2 className="text-[15px] font-black text-black/65">카테고리로 둘러보기</h2>
              <div className="mt-4 grid grid-cols-4 gap-x-3 gap-y-4">
                {categories.map((category, index) => {
                  const icons = ['briefcase', 'home', 'coin', 'art', 'building']
                  const iconClasses = [
                    'bg-[#fcecf1] text-[#e76586]',
                    'bg-[#EAF2FE] text-[#2468E0]',
                    'bg-[#fff5dc] text-[#dfa92f]',
                    'bg-[#e9f8f4] text-[#38aa89]',
                    'bg-[#f1ecfb] text-[#8b63d0]',
                  ]
                  return (
                    <button
                      key={category}
                      onClick={() => browseCategory(category)}
                      className="flex min-w-0 flex-col items-center text-center"
                    >
                      <span
                        className={`grid size-12 place-items-center rounded-2xl ${iconClasses[index]}`}
                      >
                        <Icon name={icons[index]} className="size-[22px]" />
                      </span>
                      <span className="mt-2 whitespace-nowrap text-[14px] font-black">
                        {category}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {recentSearchTerms.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-black text-black/65">최근 검색어</h2>
                  <button
                    onClick={clearRecentSearchTerms}
                    className="text-[14px] font-bold text-black/60"
                  >
                    전체 삭제
                  </button>
                </div>
                <div className="mt-2">
                  {recentSearchTerms.slice(0, 3).map((term, index) => (
                    <button
                      key={term}
                      onClick={() => submitSearch(term)}
                      className="flex w-full items-center gap-3 border-b border-black/[0.06] py-3 text-left last:border-0"
                    >
                      <svg
                        className="size-4 shrink-0 text-black/30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-black/65">
                        {term}
                      </span>
                      <span className="text-[14px] font-semibold text-black/30">
                        {index === 0 ? '오늘' : index === 1 ? '어제' : '09.28'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

          </div>
        </main>
        <BottomNav />
      </AppShell>
    )
  }
  const totalResults = results.length
  return (
    <AppShell className={accentTheme}>
      <header className="sticky top-0 z-40 border-b border-black/[0.05] bg-white/95 px-5 pb-4 pt-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <BackButton />
          <div className="min-w-0 flex-1">
            <SearchField
              value={queryInput}
              onChange={setQueryInput}
              onSubmit={() => submitSearch()}
              placeholder="정책명 또는 키워드를 입력해주세요"
              buttonLabel="검색"
            />
          </div>
        </div>
      </header>

      <main className="pb-28">
        <section className="border-b border-black/[0.06] bg-white px-5 py-4">
          <DragScroll className="no-scrollbar flex gap-2 overflow-x-auto">
            <button
              onClick={() => openFilters()}
              className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-extrabold ${
                filterCount
                  ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
                  : 'border-black/10 bg-white text-black/60'
              }`}
            >
              필터 {filterCount}
            </button>
            {appliedChips.slice(0, 3).map((chip) => (
              <button
                key={`${chip.type}-${chip.value}`}
                onClick={() => removeFilter(chip.type, chip.value, chip.category)}
                className="shrink-0 rounded-full bg-[#EAF2FE] px-3.5 py-2.5 text-xs font-extrabold text-[#2468E0]"
              >
                {chip.value} ×
              </button>
            ))}
            {appliedChips.length > 3 && (
              <button
                onClick={() => openFilters()}
                className="shrink-0 rounded-full bg-[#f3f4f6] px-3.5 py-2.5 text-xs font-extrabold text-black/60"
              >
                +{appliedChips.length - 3}
              </button>
            )}
          </DragScroll>
          {(appliedFilters.myConditionsOnly || customCount > 0) && (
            <ConditionSummaryStrip
              conditions={appliedFilters.myConditionsOnly ? profileConditions : customConditions}
              customized={!appliedFilters.myConditionsOnly}
              onClick={() => openFilters()}
            />
          )}
        </section>

        <section className="px-5 pt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="shrink-0 text-lg font-black tracking-[-0.04em]">
              검색 결과 <span className="text-[#2468E0]">{totalResults}건</span>
            </h2>
            <div className="w-28">
              <AppSelect
                value={policySearch.sort}
                options={['추천순', '마감 임박순', '최신순']}
                onChange={(value) =>
                  setPolicySearch({
                    sort: value,
                  })
                }
                compact
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {results.map((policy) => (
              <article
                key={policy.id}
                onClick={() => {
                  addRecent(policy.id)
                  navigate(`/policies/${policy.id}`)
                }}
                className="cursor-pointer rounded-[22px] border border-black/[0.06] bg-white p-5 shadow-[0_5px_18px_rgba(23,25,35,0.035)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <PolicyTags
                      category={policy.category}
                      region={
                        ['부산시', '부산 전체'].includes(policy.region)
                          ? '부산광역시'
                          : policy.region
                      }
                    />
                    {policy.recruitmentStatus === '마감됨' && (
                      <span className="rounded-md bg-[#fdeaea] px-2 py-1 text-[10px] font-extrabold text-[#d33a3a]">
                        마감
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleSaved(policy.id)
                    }}
                    className={`grid size-9 shrink-0 place-items-center rounded-full ${
                      savedPolicies.includes(policy.id)
                        ? 'bg-[#2F7BF5] text-white'
                        : 'bg-[#f4f5f7] text-black/25'
                    }`}
                    aria-label={`${policy.title} 관심 정책`}
                  >
                    <Icon
                      name="heart"
                      className={`size-[18px] ${
                        savedPolicies.includes(policy.id) ? 'fill-current' : ''
                      }`}
                    />
                  </button>
                </div>
                <h3 className="mt-3 text-base font-black leading-snug tracking-[-0.025em]">
                  {policy.title}
                </h3>
                <p className="mt-2 text-[13px] font-medium leading-5 text-black/60">
                  {policy.description}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3">
                  <span className="text-[11px] font-semibold text-black/60">
                    신청기간 {policy.applicationPeriod}
                  </span>
                  <span
                    className={`text-xs font-black ${
                      policy.deadline.startsWith('D-') ? 'text-[#2468E0]' : 'text-black/60'
                    }`}
                  >
                    {policy.deadline}
                  </span>
                </div>
              </article>
            ))}
            {totalResults === 0 && (
              <div className="rounded-[24px] bg-white px-6 py-14 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#EAF2FE] text-[#2468E0]">
                  <Icon name="search" className="size-6" />
                </span>
                <p className="mt-4 text-sm font-black">조건에 맞는 결과가 없어요</p>
                <p className="mt-1 text-xs font-medium text-black/60">
                  검색어나 필터를 다시 확인해주세요.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
      <BottomNav />

      {sheetOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35"
          onClick={() => setSheetOpen(false)}
        >
          <div
            ref={sheetRef}
            style={sheetHeight ? { height: sheetHeight } : undefined}
            className={`flex max-h-[92vh] w-full max-w-[480px] flex-col rounded-t-[28px] bg-white shadow-2xl ${sheetDrag.current ? '' : 'transition-[height] duration-150'}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="shrink-0 cursor-grab touch-none select-none px-5 pt-3 active:cursor-grabbing"
              onPointerDown={(event) => {
                if (event.target.closest('button') || !sheetRef.current) return
                event.currentTarget.setPointerCapture(event.pointerId)
                sheetDrag.current = { y: event.clientY, h: sheetRef.current.offsetHeight }
              }}
              onPointerMove={(event) => {
                const drag = sheetDrag.current
                if (!drag) return
                const max = window.innerHeight * 0.92
                setSheetHeight(Math.min(max, Math.max(120, drag.h + drag.y - event.clientY)))
              }}
              onPointerUp={() => {
                const drag = sheetDrag.current
                sheetDrag.current = null
                if (!drag) return
                const h = sheetRef.current?.offsetHeight ?? drag.h
                if (h < window.innerHeight * 0.3) setSheetOpen(false)
                else setSheetHeight(Math.max(h, window.innerHeight * 0.4))
              }}
              onPointerCancel={() => {
                sheetDrag.current = null
              }}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
              <div className="mb-4 mt-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black">필터</h2>
                  <p className="mt-1 text-[10px] font-medium text-black/60">
                    필요한 조건만 간단히 설정해보세요.
                  </p>
                </div>
                <button
                  onClick={() => setSheetOpen(false)}
                  className="grid size-8 place-items-center rounded-full bg-[#f3f4f6] text-lg text-black/60"
                  aria-label="필터 닫기"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              <section>
                <h3 className="text-sm font-black">분야</h3>
                <div className="mt-3">
                  <InterestAccordion
                    options={categories}
                    selection={{ categories: draft.categories, details: draft.categoryDetails }}
                    onChange={(next) =>
                      setDraft((current) => ({
                        ...current,
                        categories: next.categories,
                        categoryDetails: next.details,
                      }))
                    }
                  />
                </div>
              </section>

              <div className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06]">
                <SummaryRow
                  label="지역"
                  value={
                    !isAllRegions(draft.regions)
                      ? `${draft.regions[0]}${draft.regions.length > 1 ? ` 외 ${draft.regions.length - 1}` : ''}`
                      : '부산 전체'
                  }
                  onClick={() => setSubFilter('region')}
                />
                <SummaryRow
                  label="모집 상태"
                  value={
                    draft.statuses.length
                      ? `${draft.statuses[0]}${draft.statuses.length > 1 ? ` 외 ${draft.statuses.length - 1}` : ''}`
                      : '전체'
                  }
                  onClick={() => setSubFilter('status')}
                />
                <SummaryRow
                  label="신청 기간"
                  value={
                    draft.dateStart || draft.dateEnd
                      ? `${draft.dateStart || '시작일'} ~ ${draft.dateEnd || '종료일'}${draft.includeAlways ? ' · 상시 포함' : ''}`
                      : '전체 기간'
                  }
                  onClick={() => setSubFilter('date')}
                />
              </div>

              <section className="mt-6">
                <h3 className="text-sm font-black">내 조건</h3>
                <p className="mt-2 text-[11px] font-semibold text-black/60">
                  사하구 ·{' '}
                  {summarize(
                    orderedConditions(draft.myConditionsOnly ? profileConditions : draftConditions),
                    2
                  )}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-extrabold">내 조건에 맞는 정책만 보기</span>
                  <button
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        myConditionsOnly: !current.myConditionsOnly,
                      }))
                      if (!draft.myConditionsOnly) setConditionsOpen(false)
                    }}
                    className={`relative h-7 w-12 rounded-full transition ${
                      draft.myConditionsOnly ? 'bg-[#2F7BF5]' : 'bg-black/15'
                    }`}
                    role="switch"
                    aria-checked={draft.myConditionsOnly}
                  >
                    <span
                      className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition ${draft.myConditionsOnly ? 'left-6' : 'left-1'}`}
                    />
                  </button>
                </div>
                {draft.myConditionsOnly && (
                  <ConditionSummaryStrip
                    conditions={profileConditions}
                    customized={false}
                    onClick={() => setAppliedSheetOpen(true)}
                  />
                )}
                {!draft.myConditionsOnly && conditionCount(draftConditions) > 0 && (
                  <ConditionSummaryStrip
                    conditions={draftConditions}
                    customized
                    onClick={() => setAppliedSheetOpen(true)}
                  />
                )}
                <ConditionToggleButton
                  open={conditionsOpen}
                  disabled={draft.myConditionsOnly}
                  onClick={() => setConditionsOpen((open) => !open)}
                />
                <Collapse open={conditionsOpen && !draft.myConditionsOnly}>
                  <div className="pt-2">
                    <ConditionFields conditions={draftConditions} onChange={setDraftConditions} />
                    <div className="mt-2 flex items-center justify-between px-1">
                      <p className="text-[10px] font-medium text-black/60">
                        이번 검색에만 적용돼요. 프로필은 바뀌지 않아요.
                      </p>
                    </div>
                  </div>
                </Collapse>
              </section>
            </div>

            <div className="flex shrink-0 gap-3 border-t border-black/[0.06] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
              <button
                onClick={resetDraft}
                className="w-24 rounded-2xl bg-[#f1f2f5] py-4 text-sm font-extrabold text-black/60"
              >
                초기화
              </button>
              <button
                onClick={applyFilters}
                className="flex-1 rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white"
              >
                결과 {draftResults}건 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetOpen && appliedSheetOpen && (
        <AppliedConditionsSheet
          conditions={draft.myConditionsOnly ? profileConditions : draftConditions}
          customized={!draft.myConditionsOnly}
          onClose={() => setAppliedSheetOpen(false)}
          onEdit={() => {
            setAppliedSheetOpen(false)
            if (draft.myConditionsOnly) {
              navigate('/settings?view=profile')
              return
            }
            setConditionsOpen(true)
          }}
        />
      )}

      {subFilter && (
        <SubFilterSheet
          type={subFilter}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setSubFilter(null)}
        />
      )}
    </AppShell>
  )
}
function FilterGroup({ title, options, selected, onToggle }) {
  return (
    <section>
      <h3 className="text-sm font-black">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3.5 py-2.5 text-xs font-extrabold ${
              selected.includes(option)
                ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
                : 'border-black/10 bg-white text-black/60'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  )
}
function SummaryRow({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 py-4 text-left">
      <span className="w-20 text-xs font-black">{label}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-black/60">{value}</span>
      <span className="text-black/30">›</span>
    </button>
  )
}
function SubFilterSheet({ type, draft, setDraft, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/25"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
        <div className="mb-5 mt-5 flex items-center justify-between">
          <h2 className="text-lg font-black">
            {type === 'region' ? '지역' : type === 'status' ? '모집 상태' : '신청 기간'}
          </h2>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full bg-[#f3f4f6] text-lg text-black/60"
          >
            ×
          </button>
        </div>
        {type === 'region' && (
          <FilterGroup
            title="부산 지역을 선택해주세요"
            options={regions}
            selected={draft.regions}
            onToggle={(value) =>
              setDraft((current) => ({
                ...current,
                regions: toggleItem(current.regions, value),
              }))
            }
          />
        )}
        {type === 'status' && (
          <FilterGroup
            title="모집 상태를 선택해주세요"
            options={statuses}
            selected={draft.statuses}
            onToggle={(value) =>
              setDraft((current) => ({
                ...current,
                statuses: toggleItem(current.statuses, value),
              }))
            }
          />
        )}
        {type === 'date' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-black/60">
              시작일
              <input
                type="date"
                value={draft.dateStart}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dateStart: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-3 py-3 text-xs font-bold text-black"
              />
            </label>
            <label className="text-xs font-bold text-black/60">
              종료일
              <input
                type="date"
                value={draft.dateEnd}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dateEnd: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-3 py-3 text-xs font-bold text-black"
              />
            </label>
            <label className="col-span-2 flex cursor-pointer items-center gap-2.5 text-xs font-bold text-black/65">
              <input
                type="checkbox"
                checked={draft.includeAlways}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includeAlways: event.target.checked,
                  }))
                }
                className="size-[18px] accent-[#2F7BF5]"
              />
              상시 모집 포함
            </label>
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white"
        >
          선택 완료
        </button>
      </div>
    </div>
  )
}
