// src/screens/minju/HomeScreen.tsx
// 개인 사본 MinjuApp.tsx의 "홈 탭"을 팀 앱 라우터용 화면으로 옮긴 것
// - default export (routes.tsx 의 index / "*" 경로에 연결)
// - lucide-react 없이 ./icons, ./index 사용
// - 찜·맞춤정보·신청 준비물은 마이의 계정별 상태를 공유
// - 종 → /notifications, 캘린더 › → /calendar, 전체 보기 → /search?mine=true&category=...
// - 한눈이: 끌어서 이동, ✕로 숨김(되돌리기), 숨기면 헤더에 얼굴 버튼, 누르면 AI 대화창(전체 화면)
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AppShell, BottomNav } from '../../components/PolicyLayout'
import {
  AppHeader,
  CategoryRow,
  CategoryDonut,
  SegmentToggle,
  GuideBox,
  DeadlineCard,
  BenefitCard,
  CATEGORIES,
  Hannuni,
} from './index'
import { ChevronRight, Info, Sparkles, Search, Camera, X } from './icons'
import { AiSheet } from './AiSheet'
import { useAppState } from '../../app/AppState'
import { policyCatalog } from '../../data/policies'
import { evaluateEligibility, recommendedSort } from '../../data/eligibility'
import { profileToConditions } from '../../data/conditions'
/* ---------- 화면 장식 위치 저장 ---------- */
const HIDDEN_KEY = 'minju_hannuni_hidden'
const POS_KEY = 'minju_hannuni_pos_v1'
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const v = JSON.parse(raw)
    return v ?? fallback
  } catch {
    return fallback
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 실패해도 화면은 계속 */
  }
}
/* ---------- 고정 레이어 (앱 폭 480px 안에 맞춤) ---------- */
const LAYER = 'fixed inset-y-0 left-1/2 w-full max-w-[480px] -translate-x-1/2'
/* ---------- 떠 있는 한눈이 ---------- */
function FloatingHannuni({ onOpen, onHide }) {
  const layerRef = useRef(null)
  const [pos, setPos] = useState(() => {
    const v = load(POS_KEY, {
      right: 18,
      bottom: 112,
    })
    return typeof v?.right === 'number' && typeof v?.bottom === 'number'
      ? v
      : { right: 18, bottom: 112 }
  })
  const drag = useRef(null)
  useEffect(() => save(POS_KEY, pos), [pos])
  const onDown = (e) => {
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      right: pos.right,
      bottom: pos.bottom,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const rect = layerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? window.innerWidth
    const h = rect?.height ?? window.innerHeight
    const SIZE = 68
    setPos({
      right: Math.min(Math.max(8, d.right - dx), w - SIZE - 8),
      bottom: Math.min(Math.max(96, d.bottom - dy), h - SIZE - 60), // 하단 탭바(약 90px) 피하기
    })
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) onOpen()
  }
  return (
    <div ref={layerRef} className={`${LAYER} pointer-events-none z-40`}>
      <div
        className="pointer-events-auto absolute"
        style={{ right: pos.right, bottom: pos.bottom }}
      >
        <button
          type="button"
          aria-label="AI 한눈이에게 물어보기"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => (drag.current = null)}
          className="flex size-[68px] cursor-grab touch-none select-none items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(47,123,245,0.32)] active:cursor-grabbing"
        >
          <Hannuni size={54} />
        </button>
        <button
          type="button"
          aria-label="한눈이 숨기기"
          onClick={onHide}
          className="absolute -right-1 -top-1 flex size-[22px] cursor-pointer items-center justify-center rounded-full bg-[#9AA4B5] text-white ring-2 ring-white"
        >
          <X size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
/* ---------- 검색창 (입력 후 검색 탭으로) ---------- */
function HomeSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const t = q.trim()
    navigate(`/search${t ? `?q=${encodeURIComponent(t)}` : ''}`)
  }
  return (
    <form
      onSubmit={submit}
      className="flex h-[54px] items-center gap-2.5 rounded-[18px] border border-[#D5E5FD] bg-white pl-2 pr-2 shadow-[0_6px_20px_rgba(47,123,245,0.08)] focus-within:border-2 focus-within:border-[#2F7BF5]"
    >
      <button
        type="submit"
        aria-label="검색"
        className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#EAF2FE] text-[#2F7BF5]"
      >
        <Search size={18} strokeWidth={2.4} />
      </button>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9AA4B5]"
        placeholder="정책명·키워드 검색 (예: 월세, 면접정장)"
        aria-label="정책 검색어"
      />
      <button
        type="button"
        aria-label="카메라 검색"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[#5F6B80] hover:bg-[#F2F6FC]"
      >
        <Camera size={19} />
      </button>
    </form>
  )
}
/* ---------- 홈 화면 ---------- */
export default function HomeScreen() {
  const navigate = useNavigate()
  const [sel, setSel] = useState(null)
  const [scope, setScope] = useState('내 맞춤')
  const {
    savedPolicies: likes,
    toggleSaved,
    profile,
    applications,
    preparationChecks,
  } = useAppState()
  const [fab, setFab] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [hideToast, setHideToast] = useState(false)
  const [unlikeToast, setUnlikeToast] = useState(null)
  const [chat, setChat] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, fab ? '0' : '1')
    } catch {
      /* 무시 */
    }
  }, [fab])
  useEffect(() => {
    if (!unlikeToast) return
    const t = window.setTimeout(() => setUnlikeToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [unlikeToast])
  useEffect(() => {
    if (!hideToast) return
    const t = window.setTimeout(() => setHideToast(false), 5000)
    return () => window.clearTimeout(t)
  }, [hideToast])
  const all = scope === '전체'
  const conditions = profileToConditions(profile)
  const real = policyCatalog.filter((p) => p.fromDatabase && p.itemType !== 'EVENT')
  const matched = real.filter(
    (p) =>
      evaluateEligibility(p, conditions, profile.region).overall !== '대상 아님' &&
      p.recruitmentStatus !== '마감됨'
  )
  const visible = all ? real : matched
  const counts = CATEGORIES.map((c) => visible.filter((p) => p.category === c.label).length)
  const list = recommendedSort(
    visible.filter((p) => sel === null || p.category === CATEGORIES[sel].label),
    conditions,
    profile.region
  ).slice(0, 3)
  const unread = 0
  const deadlines = real
    .filter((p) => likes.includes(p.id) && /^D-(\d+)$|^D-Day$/.test(p.deadline))
    .map((p) => {
      const app = applications.find((a) => a.policyId === p.id)
      let docs = p.required_documents ?? []
      if (typeof docs === 'string') {
        try {
          docs = JSON.parse(docs)
        } catch {
          docs = []
        }
      }
      return {
        id: p.id,
        days: p.deadline === 'D-Day' ? 0 : Number(p.deadline.slice(2)),
        title: p.title,
        meta: p.region,
        done:
          app?.requiredDocuments.filter((d) => d.status === 'completed').length ??
          preparationChecks[p.id]?.length ??
          0,
        total: Array.isArray(docs) ? docs.length : 0,
      }
    })
    .filter((d) => d.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10)
  const unlike = (id) => {
    toggleSaved(id)
    setUnlikeToast({ id, key: Date.now() })
  }
  const undoUnlike = () => {
    if (!unlikeToast) return
    const id = unlikeToast.id
    if (!likes.includes(id)) toggleSaved(id)
    setUnlikeToast(null)
  }
  const restore = () => {
    setFab(true)
    setHideToast(false)
  }
  return (
    <AppShell>
      <div className="-mt-11 min-h-screen bg-gradient-to-b from-[#EAF3FF] to-[#F6F9FE] pb-32 pt-11 text-[#18202F]">
        <AppHeader
          unread={unread}
          onBell={() => navigate('/notifications')}
          hannuniHidden={!fab}
          onRestore={restore}
        />

        <div className="relative z-10 flex flex-col gap-6 px-[18px]">
          <HomeSearch />
          <button
            onClick={() => navigate('/events')}
            className="self-end text-xs font-bold text-[#2F7BF5]"
          >
            공연·전시·문화행사 보기 →
          </button>

          {/* 원 그래프 카드 */}
          <section className="flex flex-col gap-3 rounded-[24px] bg-gradient-to-br from-[#DDEBFF] to-[#ECE3FF] p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
            <div className="flex items-center gap-3">
              <CategoryDonut
                values={counts.map((n) =>
                  visible.length ? Math.round((n / visible.length) * 100) : 0
                )}
                counts={counts}
                total={visible.length}
                selected={sel}
                onSelect={setSel}
              />
              <div className="flex flex-1 flex-col gap-3">
                {sel === null ? (
                  <>
                    <p className="text-[15px] font-bold leading-[1.45]">
                      <span className="text-[#2F7BF5]">{profile.region || '거주지역 미입력'}</span>
                      <br />
                      <span className="text-[#2F7BF5]">{profile.age}</span> {profile.name} 님을 위한
                      <br />
                      맞춤 혜택이에요!
                    </p>
                    <button
                      type="button"
                      onClick={() => setChat(true)}
                      className="flex cursor-pointer flex-col gap-1 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
                    >
                      <span className="flex items-center gap-1 text-[12.5px] font-bold text-[#2F7BF5]">
                        <Sparkles size={13} fill="#2F7BF5" /> AI 맞춤 추천{' '}
                        <ChevronRight size={14} className="ml-auto" />
                      </span>
                      <span className="text-[11.5px] text-[#5F6B80]">
                        {profile.interests.join(' / ') || '마이에서 관심 분야를 선택해주세요'}
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <p className="text-[15px] font-bold leading-[1.45]">
                        <span className="text-[#2F7BF5]">{CATEGORIES[sel].label}</span> 혜택이
                        <br />
                        {sel === 0 ? '가장 많아요' : '준비되어 있어요'}
                      </p>
                      <p className="text-[11.5px] text-[#5F6B80]">
                        전체 {visible.length}개 중{' '}
                        <b className="text-[#18202F]">
                          {visible.length ? Math.round((counts[sel] / visible.length) * 100) : 0}%
                        </b>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChat(true)}
                      className="flex cursor-pointer flex-col gap-1 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
                    >
                      <span className="flex items-center gap-1 text-[12px] font-bold text-[#2F7BF5]">
                        <Sparkles size={12} fill="#2F7BF5" /> 이 분야 AI 추천{' '}
                        <ChevronRight size={14} className="ml-auto" />
                      </span>
                      <span className="text-[13px] font-bold text-[#18202F]">
                        {list[0]?.title || '등록된 정책이 없어요'}
                      </span>
                      <span className="text-[11px] font-semibold text-[#EF4E6C]">
                        {list[0]?.deadline || ''}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* 카테고리 */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold">카테고리로 둘러보기</h2>
              <SegmentToggle options={['내 맞춤', '전체']} value={scope} onChange={setScope} />
            </div>
            <CategoryRow
              counts={counts}
              selected={sel}
              onSelect={(i) => setSel(sel === i ? null : i)}
            />
            {all && (
              <p className="flex items-center gap-1 px-1 text-[11px] text-[#9AA4B5]">
                <Info size={12} /> DB 연결 혜택 전체 {real.length}개 · 나에게 해당하지 않는 혜택도
                포함돼요
              </p>
            )}
          </section>

          {/* 선택 전 안내 / 선택 후 혜택 3개 */}
          {sel === null ? (
            <GuideBox>그래프나 카테고리를 누르면 맞춤 혜택이 나와요</GuideBox>
          ) : (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[17px] font-bold">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: CATEGORIES[sel].color }}
                  />
                  {CATEGORIES[sel].label} {all ? '전체' : '맞춤'} 혜택{' '}
                  <span className="text-[#2F7BF5]">{counts[sel]}</span>
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/search?${all ? '' : 'mine=true&'}category=${encodeURIComponent(CATEGORIES[sel].label)}`
                    )
                  }
                  className="flex cursor-pointer items-center rounded-full bg-[#EAF2FE] px-3 py-1.5 text-[12px] font-semibold text-[#2F7BF5]"
                >
                  전체 보기
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {list.map((b) => (
                  <div key={b.id} className="">
                    <BenefitCard
                      b={{
                        id: b.id,
                        title: b.title,
                        desc: b.description,
                        region: b.region,
                        days: Number(b.deadline.slice(2)) || 0,
                        status: {
                          '신청 가능': 'ok',
                          '대상 아님': 'no',
                          '확인 필요': 'check',
                        }[evaluateEligibility(b, conditions, profile.region).overall],
                        liked: likes.includes(b.id),
                      }}
                      deadlineLabel={b.deadline}
                      onSave={() => toggleSaved(b.id)}
                      onOpen={() => navigate('/policies/' + b.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 찜한 정책 마감 임박 (2주 이내) */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold">🔥 찜한 정책 마감 임박</h2>
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className="-my-3 -mr-2 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center px-2 text-[12.5px] font-medium text-[#9AA4B5]"
              >
                캘린더
                <ChevronRight size={14} />
              </button>
            </div>
            {deadlines.length ? (
              <div className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[18px] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {deadlines.map((d) => (
                  <DeadlineCard
                    key={d.id}
                    d={d}
                    onUnlike={() => unlike(d.id)}
                    onOpen={() => navigate('/policies/' + d.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-[18px] bg-white/70 py-6 text-center text-[12.5px] text-[#9AA4B5]">
                2주 안에 마감되는 찜한 정책이 없어요
              </p>
            )}
          </section>
        </div>
      </div>

      {/* 떠 있는 한눈이 */}
      {fab && !chat && (
        <FloatingHannuni
          onOpen={() => setChat(true)}
          onHide={() => {
            setFab(false)
            setHideToast(true)
          }}
        />
      )}

      {/* 토스트 */}
      {(hideToast || unlikeToast) && (
        <div className={`${LAYER} pointer-events-none z-50`}>
          <div className="pointer-events-auto absolute inset-x-[18px] bottom-[110px] flex items-center gap-2 rounded-[16px] bg-[#18202F]/95 py-1 pl-4 pr-1 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(24,32,47,0.3)]">
            <span className="flex-1">{unlikeToast ? '찜을 해제했어요' : '한눈이를 숨겼어요'}</span>
            <button
              type="button"
              onClick={unlikeToast ? undoUnlike : restore}
              className="h-[44px] cursor-pointer px-3 font-bold text-[#6FA6FF]"
            >
              되돌리기
            </button>
          </div>
        </div>
      )}

      {/* AI 대화창 (전체 화면, ✕로 닫기) */}
      {chat && (
        <div className={`${LAYER} z-[60]`}>
          <AiSheet variant="recommend" onClose={() => setChat(false)} />
        </div>
      )}

      <BottomNav active="홈" />
    </AppShell>
  )
}
