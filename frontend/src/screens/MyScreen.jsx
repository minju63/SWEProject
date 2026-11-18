import { BottomNav } from '../components/PolicyLayout'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { todayISO, useAppState } from '../app/AppState'
import AppSelect from '../components/AppSelect'
import { findPolicyByTitle, policyCatalog, getRequiredDocumentItems } from '../data/policies'
import { Icon } from './HomeScreen'
import { useAuth } from '../lib/auth'
const stages = ['신청 준비', '신청 완료', '결과 확인']
const savedFilters = ['전체', '신청 가능', '마감 임박', '종료']
import { getCompletion } from '../data/profileCompletion'
import {
  ApplicationCard,
  PreparationScreen,
  CategoryTags,
  Deadline,
} from '../components/ApplicationManagement'
import './MyDesign.css'
import { applicationForProfile } from '../data/myApplications'
import { evaluateEligibility } from '../data/eligibility'
import { profileToConditions } from '../data/conditions'
export default function MyScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, ready, requestLogin } = useAuth()
  const {
    savedPolicies,
    recentPolicies,
    applications,
    profile,
    toggleSaved,
    clearRecent,
    addApplication,
    updateApplication,
    toggleApplicationDocument,
  } = useAppState()
  const applicationRef = useRef(null)
  const savedRef = useRef(null)
  const [activeStage, setActiveStage] = useState('신청 준비')
  const [expandedId, setExpandedId] = useState(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [savedFilter, setSavedFilter] = useState('전체')
  const [notice, setNotice] = useState('')
  const [addMode, setAddMode] = useState('saved')
  const [selectedPolicies, setSelectedPolicies] = useState([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  function toggleSelection(id) {
    setSelectedPolicies((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [newStage, setNewStage] = useState('신청 준비')
  const [newDeadline, setNewDeadline] = useState('')
  const [newMemo, setNewMemo] = useState('')
  const preparationId = params.get('prepare')
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [preparationId])
  useEffect(() => {
    if (!addOpen && !completionOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event) => {
      if (event.key === 'Escape' && !adding) {
        setAddOpen(false)
        setCompletionOpen(false)
      }
    }
    document.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', close)
    }
  }, [addOpen, completionOpen, adding])
  const completion = getCompletion(profile)
  const profileSummary = [profile.age, profile.region, profile.status].filter(Boolean).join(' · ')
  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        stages.map((stage) => [stage, applications.filter((item) => item.stage === stage).length])
      ),
    [applications]
  )
  const managed = new Set(applications.map((item) => item.policyId))
  const visibleApplications = applications
    .filter((item) => item.stage === activeStage)
    .map((item) => applicationForProfile(item, profile))
  const visibleSaved = savedPolicies.filter((title) => {
    if (savedFilter === '전체') return true
    const policy = findPolicyByTitle(title)
    if (!policy) return false
    if (savedFilter === '신청 가능')
      return (
        ['모집 중', '7일 내 마감', '상시'].includes(policy.recruitmentStatus) &&
        evaluateEligibility(policy, profileToConditions(profile), profile.region).overall ===
          '신청 가능'
      )
    return policy.status === savedFilter
  })
  const searchResults = policyCatalog.filter(
    (policy) =>
      policy.itemType !== 'EVENT' &&
      `${policy.title} ${policy.description}`
        .toLocaleLowerCase()
        .includes(searchQuery.trim().toLocaleLowerCase())
  )
  function selectSummary(stage) {
    if (stage) {
      setActiveStage(stage)
      applicationRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    } else {
      savedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  async function handleAdd(event) {
    event.preventDefault()
    if (adding) return
    const titles = addMode === 'manual' ? [manualName.trim()].filter(Boolean) : selectedPolicies
    if (!titles.length) return
    setAddError('')
    setAdding(true)
    const failed = []
    try {
      for (const title of titles) {
        const policy = addMode === 'manual' ? undefined : findPolicyByTitle(title)
        const saved = await addApplication({
          policyId: policy?.id ?? `manual-${Date.now()}`,
          policyName: policy?.title ?? title,
          region: policy?.region ?? '직접 입력',
          category: policy?.category ?? '직접 입력',
          stage: newStage,
          applicationDeadline: newDeadline || policy?.applicationEndDate || '',
          applicationDate: newStage === '신청 완료' ? todayISO() : '',
          expectedResultDate: '',
          resultNotificationEnabled: false,
          applicationNumber: '',
          reviewStatus: '접수 완료',
          memo: newMemo,
          officialUrl: policy?.applicationUrl || policy?.officialUrl,
          eligibilityChecks: [{ label: '공식 공고의 신청 조건 확인 필요', status: 'needs_check' }],
          requiredDocuments: (policy ? getRequiredDocumentItems(policy) : []).map((document) => ({
            name: document.name,
            description:
              document.required === false
                ? '해당자만 제출 · 본인에게 적용되는 조건인지 확인해주세요.'
                : '',
            status: 'pending',
          })),
          resultStatus: '결과 대기',
          resultDate: '',
          nextActions: [],
          isExample: policy?.isExample,
        })
        if (!saved) failed.push(title)
      }
      if (failed.length) {
        setSelectedPolicies(failed)
        setAddError('일부 혜택을 추가하지 못했어요. 선택한 항목을 다시 시도해주세요.')
        return
      }
      setActiveStage(newStage)
      setAddOpen(false)
      setSelectedPolicies([])
      setManualName('')
      setNewDeadline('')
      setNewMemo('')
      setNotice('신청 관리에 혜택을 추가했어요.')
    } finally {
      setAdding(false)
    }
  }
  const preparation = applications.find((item) => item.id === params.get('prepare'))
  if (preparation)
    return (
      <>
        <PreparationScreen
          application={applicationForProfile(preparation, profile)}
          onBack={(stage) => {
            setActiveStage(stage ?? preparation.stage)
            setParams({})
          }}
          onUpdate={(patch) => updateApplication(preparation.id, patch)}
          onToggleDocument={(name) => toggleApplicationDocument(preparation.id, name)}
          onMissingLink={() => setNotice('공식 링크를 확인할 수 없습니다.')}
        />
        {notice && (
          <p className="my-toast" role="status">
            {notice}
          </p>
        )}
      </>
    )
  return (
    <div className="my-design">
      <div className="my-page">
        <header className="my-header">
          <h1 className="text-[20px] font-black tracking-[-0.04em]">마이</h1>
          <button
            onClick={() => navigate('/notifications')}
            className="relative rounded-full p-2.5"
            aria-label="알림"
          >
            <Icon name="bell" className="size-[22px]" />
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#2F7BF5]" />
          </button>
        </header>

        <main className="pb-28">
          <section className="my-profile-card">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-[22px] bg-[#f1f3fb] text-[#2F7BF5]">
                <Icon name="user" className="size-8" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {user ? (
                    <>
                      <h2 className="max-w-full truncate text-xl font-black tracking-[-0.04em]">
                        {profile.name}님
                      </h2>
                      <button
                        onClick={() => setCompletionOpen(true)}
                        className="shrink-0 rounded-full bg-[#f1f3fb] px-2 py-1 text-[10px] font-black text-[#2F7BF5]"
                      >
                        맞춤정보 {completion.percent}%
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={requestLogin}
                      disabled={!ready}
                      className="text-left text-xl font-black tracking-[-0.04em] disabled:text-black/30"
                    >
                      {ready ? '로그인하기 ›' : '로그인 확인 중…'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold text-black/40">
                  {user
                    ? profileSummary || '맞춤정보를 입력하고 혜택을 찾아보세요'
                    : '나의 찜과 신청 내역을 한곳에서 관리해요'}
                </p>
              </div>
              <button
                onClick={() => (user ? navigate('/settings') : requestLogin())}
                className="grid size-10 place-items-center rounded-xl border border-black/10 text-black/45"
                aria-label="설정 열기"
              >
                <Icon name="settings" className="size-5" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span
                  key={interest}
                  className="rounded-full bg-[#f1f3fb] px-3 py-2 text-[11px] font-extrabold text-[#2F7BF5]"
                >
                  #{interest}
                </span>
              ))}
              <button
                className="my-add-interest"
                onClick={() => (user ? navigate('/settings?view=profile') : requestLogin())}
              >
                ＋ 관심 분야
              </button>
            </div>
            <div className="my-profile-counts" aria-label="내 혜택 요약">
              {[
                {
                  label: '찜한 혜택',
                  count: savedPolicies.length,
                  action: () => selectSummary(),
                },
                {
                  label: '신청 준비',
                  count: stageCounts['신청 준비'],
                  action: () => selectSummary('신청 준비'),
                },
                {
                  label: '신청 완료',
                  count: stageCounts['신청 완료'],
                  action: () => selectSummary('신청 완료'),
                },
                {
                  label: '결과 확인',
                  count: stageCounts['결과 확인'],
                  action: () => selectSummary('결과 확인'),
                },
              ].map((summary) => (
                <button
                  key={summary.label}
                  onClick={summary.action}
                  className="rounded-2xl border border-black/[0.04] bg-[#f7f8fb] px-1 py-3.5 text-center transition active:scale-[0.98]"
                >
                  <b className="block text-[22px] font-black leading-none text-[#2F7BF5]">
                    {summary.count}
                  </b>
                  <span className="mt-2 block text-[9px] font-bold text-black/40">
                    {summary.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {notice && (
            <p
              className="mx-5 mt-4 rounded-xl bg-[#f1f3fb] px-4 py-3 text-xs font-bold text-[#2F7BF5]"
              role="status"
            >
              {notice}
            </p>
          )}

          <section
            ref={applicationRef}
            className="my-applications-section"
            aria-labelledby="application-title"
          >
            <div className="flex items-end justify-between">
              <div>
                <p className="mb-1 text-xs font-extrabold text-[#2F7BF5]">
                  내가 직접 기록하고 관리해요
                </p>
                <h2 id="application-title" className="text-xl font-black tracking-[-0.04em]">
                  내 신청 관리
                </h2>
              </div>
              <button
                onClick={() => (user ? setAddOpen(true) : requestLogin())}
                className="rounded-full bg-[#f1f3fb] px-3.5 py-2.5 text-[10px] font-extrabold text-[#2F7BF5]"
              >
                ＋ 혜택 추가
              </button>
            </div>
            <div className="my-stage-tabs">
              {stages.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2.5 text-[11px] font-extrabold ${
                    activeStage === stage
                      ? 'bg-[#2F7BF5] text-white'
                      : 'border border-black/[0.07] bg-white text-black/45'
                  }`}
                >
                  {stage}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                      activeStage === stage ? 'bg-white/20' : 'bg-[#f1f3fb] text-[#2F7BF5]'
                    }`}
                  >
                    {stageCounts[stage]}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f1f3fb] px-3 py-2.5 text-[10px] font-semibold leading-4 text-[#2F7BF5]">
              <Icon name="settings" className="mt-0.5 size-3.5 shrink-0" />
              공식 사이트와 자동 연동되지 않아요. 신청 단계와 준비물을 직접 관리해주세요.
            </div>
            <div className="mt-4 space-y-3">
              {visibleApplications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  expanded={expandedId === application.id}
                  onToggle={() =>
                    application.stage === '신청 준비'
                      ? setParams({ prepare: application.id })
                      : setExpandedId(expandedId === application.id ? null : application.id)
                  }
                  onUpdate={(patch) => updateApplication(application.id, patch)}
                  onToggleDocument={(name) => toggleApplicationDocument(application.id, name)}
                  onMissingLink={() => setNotice('공식 링크를 확인할 수 없습니다.')}
                />
              ))}
              {visibleApplications.length === 0 && (
                <div className="rounded-[22px] bg-white py-10 text-center">
                  <p className="text-sm font-black">이 단계에 관리 중인 혜택이 없어요</p>
                  <button
                    onClick={() => (user ? setAddOpen(true) : requestLogin())}
                    className="mt-2 text-xs font-extrabold text-[#2F7BF5]"
                  >
                    혜택 추가하기
                  </button>
                </div>
              )}
            </div>
          </section>

          <section ref={savedRef} className="my-saved-section" aria-labelledby="saved-title">
            <div className="flex items-center justify-between">
              <h2 id="saved-title" className="text-xl font-black tracking-[-0.04em]">
                찜한 혜택 <span className="text-[#2F7BF5]">{savedPolicies.length}</span>
              </h2>
              <button
                onClick={() => navigate('/search')}
                className="text-xs font-bold text-black/40"
              >
                혜택 찾기
              </button>
            </div>
            <div className="my-saved-tabs">
              {savedFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSavedFilter(filter)}
                  className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-extrabold ${
                    savedFilter === filter ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/40'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {visibleSaved.map((title) => {
                const policy = findPolicyByTitle(title)
                return (
                  <article key={title} className="my-saved-card">
                    <button
                      onClick={() => policy && navigate(`/policies/${policy.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <CategoryTags category={policy?.category ?? '정책'} region={policy?.region} />
                      <h3 className="mt-1 truncate text-sm font-black">{policy?.title ?? title}</h3>
                    </button>
                    <Deadline date={policy?.applicationEndDate ?? undefined} />
                    <button
                      onClick={() => toggleSaved(title)}
                      className="my-saved-heart"
                      aria-label={`${title} 찜 해제`}
                    >
                      <Icon name="heart" className="size-[18px] fill-current" />
                    </button>
                  </article>
                )
              })}
              {visibleSaved.length === 0 && (
                <div className="rounded-[20px] bg-white px-5 py-10 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f1f3fb] text-[#2F7BF5]">
                    <Icon name="heart" className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-black">
                    {savedFilter === '전체'
                      ? '아직 찜한 혜택이 없어요.'
                      : savedFilter === '종료'
                        ? '마감된 찜한 혜택이 없어요'
                        : `${savedFilter}인 찜한 혜택이 없어요`}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-black/35">
                    {savedFilter === '전체'
                      ? '관심 있는 혜택을 저장하고 다시 확인해보세요.'
                      : '다른 필터에서도 찜한 혜택을 확인해보세요.'}
                  </p>
                  <button
                    onClick={() => navigate('/search')}
                    className="mt-4 rounded-xl bg-[#2F7BF5] px-4 py-2.5 text-xs font-extrabold text-white"
                  >
                    혜택 찾아보기
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="my-recent-section" aria-labelledby="recent-title">
            <div className="flex items-center justify-between">
              <h2 id="recent-title" className="text-xl font-black tracking-[-0.04em]">
                최근 본 혜택
              </h2>
              {recentPolicies.length > 0 && (
                <button onClick={clearRecent} className="text-[10px] font-bold text-black/35">
                  최근 기록 전체 삭제
                </button>
              )}
            </div>
            {recentPolicies.length > 0 ? (
              <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">
                {recentPolicies.map((title) => {
                  const policy = findPolicyByTitle(title)
                  return (
                    <button
                      key={title}
                      onClick={() => policy && navigate(`/policies/${policy.id}`)}
                      className="my-recent-card"
                    >
                      <span className="text-[10px] font-extrabold text-[#2F7BF5]">
                        {policy?.category ?? '정책'}
                      </span>
                      <p className="mt-2 line-clamp-2 text-sm font-black leading-snug">
                        {policy?.title ?? title}
                      </p>
                      <p className="mt-2 truncate text-[11px] font-medium text-black/35">
                        {policy?.region ?? '전국'}
                      </p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] bg-white py-9 text-center">
                <p className="text-sm font-black">최근 본 혜택이 없어요</p>
                <p className="mt-1 text-[11px] text-black/35">
                  정책 상세를 확인하면 여기에 기록돼요.
                </p>
              </div>
            )}
            <p className="my-caption mt-2">최근 본 혜택은 최신 순으로 최대 5개까지 보여요.</p>
          </section>
        </main>

        <BottomNav active="마이" />

        {completionOpen && (
          <div className="my-sheet-backdrop" onClick={() => setCompletionOpen(false)}>
            <div
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[480px] rounded-t-[28px] bg-white p-5 pb-[max(24px,env(safe-area-inset-bottom))]"
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
              <div className="mt-5 flex items-center justify-between">
                <h2 className="text-lg font-black">맞춤정보 {completion.percent}%</h2>
                <button
                  onClick={() => setCompletionOpen(false)}
                  className="grid size-8 place-items-center rounded-full bg-[#f3f4f6]"
                >
                  ×
                </button>
              </div>
              <div className="mt-4 divide-y divide-black/[0.06]">
                {completion.items.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 py-3">
                    <span
                      className={`grid size-6 place-items-center rounded-full text-xs font-black ${
                        item.complete ? 'bg-[#2F7BF5] text-white' : 'bg-[#f1f3fb] text-[#2F7BF5]'
                      }`}
                    >
                      {item.complete ? '✓' : '○'}
                    </span>
                    <span className="text-sm font-bold text-black/60">{item.label}</span>
                  </div>
                ))}
              </div>
              {!profile.housingType && (
                <p className="mt-4 rounded-xl bg-[#f1f3fb] p-3 text-[11px] font-semibold leading-5 text-[#2F7BF5]">
                  주거 형태를 추가하면 주거·생활 분야 혜택을 더 정확하게 추천할 수 있어요.
                </p>
              )}
              <button
                onClick={() => navigate('/settings?view=profile')}
                className="mt-5 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white"
              >
                미입력 정보 수정
              </button>
            </div>
          </div>
        )}

        {addOpen && (
          <div className="my-sheet-backdrop" onClick={() => !adding && setAddOpen(false)}>
            <form
              role="dialog"
              aria-modal="true"
              aria-label="혜택 추가"
              onSubmit={handleAdd}
              onClick={(event) => event.stopPropagation()}
              className="my-add-sheet"
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
              <div className="mt-5 flex items-center justify-between">
                <h2 className="text-lg font-black">혜택 추가</h2>
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => setAddOpen(false)}
                  className="grid size-8 place-items-center rounded-full bg-[#f3f4f6]"
                >
                  ×
                </button>
              </div>
              <p className="my-caption mt-2">신청을 준비할 혜택을 골라 내 신청 관리에 추가해요</p>
              {addError && (
                <p role="alert" className="my-profile-notice mt-3">
                  {addError}
                </p>
              )}
              <div className="my-add-tabs">
                {[
                  { id: 'saved', label: '찜한 혜택' },
                  { id: 'search', label: '정책 검색' },
                  { id: 'manual', label: '직접 입력' },
                ].map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    disabled={adding}
                    onClick={() => {
                      setAddMode(mode.id)
                      setSelectedPolicies([])
                    }}
                    className={`rounded-xl py-3 text-[11px] font-extrabold ${
                      addMode === mode.id ? 'bg-[#2F7BF5] text-white' : 'bg-[#f3f4f7] text-black/45'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {addMode === 'saved' && (
                <div className="mt-4 space-y-2">
                  {savedPolicies.map((title) => (
                    <button
                      type="button"
                      key={title}
                      disabled={adding || managed.has(title)}
                      onClick={() => toggleSelection(title)}
                      aria-pressed={selectedPolicies.includes(title)}
                      className={`w-full rounded-xl border p-3 text-left text-xs font-bold ${
                        selectedPolicies.includes(title)
                          ? 'border-[#2F7BF5] bg-[#f1f3fb] text-[#2F7BF5]'
                          : 'border-black/[0.07]'
                      }`}
                    >
                      <span className="my-selection-check">
                        {selectedPolicies.includes(title) ? '✓' : ''}
                      </span>
                      <span>
                        <CategoryTags category={findPolicyByTitle(title)?.category ?? '정책'} />
                        <b className="block mt-1">{findPolicyByTitle(title)?.title ?? title}</b>
                        {managed.has(title) && <small>이미 신청 관리에 추가됨</small>}
                      </span>
                    </button>
                  ))}
                  {savedPolicies.length === 0 && (
                    <p className="py-6 text-center text-xs text-black/35">찜한 혜택이 없어요.</p>
                  )}
                </div>
              )}
              {addMode === 'search' && (
                <div className="mt-4">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="정책명을 검색하세요"
                    className="w-full rounded-xl bg-[#f3f4f7] px-4 py-3 text-sm font-semibold outline-none"
                  />
                  <div className="my-search-options">
                    {searchResults.map((policy) => (
                      <button
                        type="button"
                        key={policy.id}
                        disabled={adding || managed.has(policy.id)}
                        onClick={() => toggleSelection(policy.id)}
                        aria-pressed={selectedPolicies.includes(policy.id)}
                        className={`w-full rounded-xl border p-3 text-left text-xs font-bold ${
                          selectedPolicies.includes(policy.id)
                            ? 'border-[#2F7BF5] bg-[#f1f3fb] text-[#2F7BF5]'
                            : 'border-black/[0.07]'
                        }`}
                      >
                        <span className="my-selection-check">
                          {selectedPolicies.includes(policy.id) ? '✓' : ''}
                        </span>
                        <span>
                          <CategoryTags category={policy.category} />
                          <b className="block mt-1">{policy.title}</b>
                          {managed.has(policy.id) && <small>이미 신청 관리에 추가됨</small>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {addMode === 'manual' && (
                <label className="mt-4 block text-xs font-bold text-black/45">
                  혜택 이름
                  <input
                    required
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-4 py-3 text-sm font-semibold outline-none"
                  />
                </label>
              )}
              <p className="my-caption mt-3">
                추가하면 신청 준비 단계로 들어가요. 준비물 체크리스트도 만들 수 있어요.
              </p>
              <details className="my-add-extra" open={addMode === 'manual'}>
                <summary>단계·마감일·메모 입력</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <AppSelect
                    label="시작 단계"
                    value={newStage}
                    options={stages}
                    onChange={(value) => setNewStage(value)}
                  />
                  <label className="text-xs font-bold text-black/45">
                    신청 마감일
                    <input
                      type="date"
                      value={newDeadline}
                      onChange={(event) => setNewDeadline(event.target.value)}
                      className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-3 py-3 text-sm font-bold outline-none"
                    />
                  </label>
                </div>
                <label className="mt-4 block text-xs font-bold text-black/45">
                  메모
                  <textarea
                    value={newMemo}
                    onChange={(event) => setNewMemo(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl bg-[#f3f4f7] px-4 py-3 text-sm font-semibold outline-none"
                  />
                </label>
              </details>
              <button
                aria-label={addMode === 'manual' ? '추가하기' : undefined}
                disabled={
                  adding ||
                  (addMode !== 'manual' && !selectedPolicies.length) ||
                  (addMode === 'manual' && !manualName.trim())
                }
                className="mt-5 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white disabled:opacity-40"
              >
                {adding
                  ? '추가 중…'
                  : addMode === 'manual'
                    ? '추가하기'
                    : `${selectedPolicies.length}개 추가`}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
