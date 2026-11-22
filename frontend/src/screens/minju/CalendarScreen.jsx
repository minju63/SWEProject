// src/screens/minju/CalendarScreen.tsx
// 팀 앱(routes.tsx의 lazy import)에 바로 붙일 수 있게 정리한 버전
// - default export
// - "./index" 의존성 제거 (색·카테고리를 이 파일 안에 둠)
// - 찜 목록·알림을 이 화면이 직접 관리하고 localStorage("minju_...")에 저장
// - 팀 공통 틀(AppShell, BottomNav)을 그대로 사용
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AppShell, BottomNav } from '../../components/PolicyLayout'
import { POLICIES, POLICY_EXTRA as EXTRA } from './data'
const Svg = ({ size = 20, color = 'currentColor', fill = 'none', children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)
const Bell = (p) => (
  <Svg {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
)
const Settings = (p) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Svg>
)
const ChevronLeft = (p) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
)
const ChevronRight = (p) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
)
const Heart = (p) => (
  <Svg {...p}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </Svg>
)
const Plus = (p) => (
  <Svg {...p}>
    <path d="M5 12h14M12 5v14" />
  </Svg>
)
const X = (p) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)
/* ---------- 색 ---------- */
const C = { text: '#18202F', sub: '#5F6B80', faint: '#9AA4B5' }
const CATEGORY_COLORS = ['#4F9DF7', '#F98DA5', '#F9CF6E', '#76D8BC', '#BFA4F4']
const col = (i) => CATEGORY_COLORS[i] ?? '#4F9DF7'
/* ---------- 달력 (2026년 10월, 1일 = 목요일) ---------- */
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const TODAY = 5
const cells = [...Array(4).fill(null), ...Array.from({ length: 31 }, (_, i) => i + 1)]
while (cells.length % 7) cells.push(null)
/* ---------- 알림 프리셋 ---------- */
const PRESETS = [
  '1주 전',
  '3일 전',
  '1일 전',
  '당일 오전',
  '3시간 전',
  '1시간 전',
  '30분 전',
  '10분 전',
]
const DEFAULT_ALARMS = ['1일 전', '30분 전']
/* ---------- localStorage (깨진 값이면 기본값) ---------- */
const LIKES_KEY = 'minju_likes_v1'
const ALARMS_KEY = 'minju_alarms_v1'
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
const dTone = (n) =>
  n <= 7 ? ['#EF4E6C', '#FDE9ED'] : n <= 10 ? ['#C98A0C', '#FFF4D9'] : ['#2F7BF5', '#EAF2FE']
const toDate = (v) => (v instanceof Date ? v : new Date(v))
/* ---------- 카드 ---------- */
function FavCard({ f, onUnlike, onAlarm, onPick }) {
  return (
    <article
      onClick={onPick}
      className={`cursor-pointer overflow-hidden rounded-[20px] bg-white shadow-[0_6px_20px_rgba(47,123,245,0.08)] ${f.selected ? 'ring-2 ring-[#2F7BF5]' : ''}`}
    >
      <div className="flex gap-3 p-4">
        <span className="w-[4px] shrink-0 rounded-full" style={{ background: f.bar }} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              className="rounded-[7px] px-2 py-0.5 text-[11.5px] font-extrabold"
              style={{ color: f.dColor, background: f.dBg }}
            >
              {f.d}
            </span>
            <h3 className="truncate text-[15.5px] font-bold">{f.title}</h3>
          </div>
          <p className="text-[12.5px]" style={{ color: C.sub }}>
            {f.meta}
          </p>
          {f.docs && (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#EEF2F8]">
                <div
                  className="h-full rounded-full bg-[#2F7BF5]"
                  style={{ width: `${(f.docs[0] / f.docs[1]) * 100}%` }}
                />
              </div>
              <span className="text-[11.5px] font-semibold" style={{ color: C.sub }}>
                서류 {f.docs[0]}/{f.docs[1]}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="찜 해제"
          onClick={(e) => {
            e.stopPropagation()
            onUnlike()
          }}
          className="-m-[11px] flex size-[44px] shrink-0 cursor-pointer items-center justify-center"
        >
          <Heart size={22} fill="#EF4E6C" color="#EF4E6C" />
        </button>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onAlarm()
        }}
        className={`flex h-[44px] w-full cursor-pointer items-center gap-2 px-4 text-[12.5px] font-semibold ${f.alarms.length ? 'bg-[#EAF2FE] text-[#2468E0]' : 'bg-[#F2F4F8]'}`}
        style={f.alarms.length ? undefined : { color: C.faint }}
      >
        <Bell size={15} />
        {f.alarms.length ? (
          <>
            <span className="flex-1 truncate text-left">
              {f.alarms.join(' · ')} <span className="text-[#657185]">({f.alarms.length})</span>
            </span>
            <span className="flex items-center">
              변경
              <ChevronRight size={15} />
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 text-left">알림 없음</span>
            <span className="flex items-center gap-0.5 text-[#2468E0]">
              <Plus size={14} />
              알림 추가
            </span>
          </>
        )}
      </button>
    </article>
  )
}
/* ---------- 정책별 알림 설정 시트 ---------- */
function AlarmEditSheet({ title, initial, onClose, onSave }) {
  const [picked, setPicked] = useState(initial)
  const toggle = (p) =>
    setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  return (
    <div className="fixed inset-0 z-50 flex justify-center" onClick={onClose}>
      <div className="relative h-full w-full max-w-[480px] bg-black/40">
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#F6F9FE] px-[18px] pb-8 pt-2"
        >
          <div className="mx-auto mb-4 h-[5px] w-[40px] rounded-full bg-[#C9D3E2]" />
          <h2 className="text-[19px] font-extrabold">알림 설정</h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: C.sub }}>
            {title}
          </p>

          <p className="mb-2 mt-4 text-[12.5px] font-bold" style={{ color: C.sub }}>
            설정된 알림 {picked.length}
          </p>
          <div className="flex flex-col gap-2">
            {picked.length === 0 && (
              <p
                className="rounded-2xl bg-white py-4 text-center text-[12.5px]"
                style={{ color: C.faint }}
              >
                아직 알림이 없어요
              </p>
            )}
            {picked.map((p) => (
              <div
                key={p}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_6px_20px_rgba(47,123,245,0.08)]"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#EAF2FE] text-[#2468E0]">
                  <Bell size={16} />
                </span>
                <b className="flex-1 text-[14.5px]">{p}</b>
                <button
                  type="button"
                  aria-label={`${p} 알림 삭제`}
                  onClick={() => toggle(p)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#F0F3F8]"
                  style={{ color: C.sub }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 text-[12.5px] font-bold" style={{ color: C.sub }}>
            빠르게 추가{' '}
            <span className="font-medium" style={{ color: C.faint }}>
              · 여러 개 선택 가능
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = picked.includes(p)
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => toggle(p)}
                  className={`h-9 cursor-pointer rounded-full px-3.5 text-[12.5px] font-bold ${
                    on
                      ? 'bg-[#2F7BF5] text-white'
                      : 'bg-white shadow-[0_4px_12px_rgba(47,123,245,0.08)]'
                  }`}
                  style={on ? undefined : { color: '#36415A' }}
                >
                  {on ? '✓ ' : ''}
                  {p}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => onSave(picked)}
            className="mt-6 h-[52px] w-full cursor-pointer rounded-2xl bg-[#2F7BF5] text-[15px] font-extrabold text-white"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
/* ---------- 화면 ---------- */
export default function CalendarScreen() {
  const navigate = useNavigate()
  // 찜할 수 있는 정책 = data.tsx에서 마감 정보가 있는 것
  const candidates = useMemo(() => POLICIES.filter((p) => EXTRA && EXTRA[p.id]), [])
  const [likes, setLikes] = useState(() => {
    const v = load(
      LIKES_KEY,
      candidates.slice(0, 5).map((p) => p.id)
    )
    return Array.isArray(v) ? v : []
  })
  const [alarms, setAlarms] = useState(() => {
    const v = load(ALARMS_KEY, {})
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  })
  const [selectedDay, setDay] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)
  useEffect(() => save(LIKES_KEY, likes), [likes])
  useEffect(() => save(ALARMS_KEY, alarms), [alarms])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [toast])
  const liked = candidates.filter((p) => likes.includes(p.id))
  const DOTS = {}
  liked.forEach((p) => {
    const day = toDate(p.deadline).getDate()
    ;(DOTS[day] ??= []).push(col(p.color))
  })
  const favs = liked
    .map((p) => {
      const x = EXTRA[p.id] ?? { days: 0 }
      const [dColor, dBg] = dTone(x.days)
      return {
        id: p.id,
        day: toDate(p.deadline).getDate(),
        d: `D-${x.days}`,
        dColor,
        dBg,
        title: p.title,
        meta: p.meta,
        bar: col(p.color),
        docs: x.docs,
        alarms: alarms[p.id] ?? DEFAULT_ALARMS,
      }
    })
    .sort((a, b) => a.day - b.day)
  const shown = selectedDay ? favs.filter((f) => f.day === selectedDay) : favs
  const editingFav = favs.find((f) => f.id === editing)
  const unlike = (id) => {
    setLikes((cur) => cur.filter((x) => x !== id))
    setToast({ id })
  }
  const undo = () => {
    if (!toast) return
    setLikes((cur) => (cur.includes(toast.id) ? cur : [...cur, toast.id]))
    setToast(null)
  }
  return (
    <AppShell>
      <div className="flex flex-col gap-5 px-[18px] pb-28 pt-2">
        <header className="flex h-[48px] items-center justify-between">
          <h1 className="text-[22px] font-bold">캘린더</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/settings/alarm')}
              className="flex h-[36px] cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-semibold shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
              style={{ color: C.sub }}
            >
              <Settings size={15} />
              기본 알림
            </button>
            <button
              type="button"
              aria-label="알림"
              onClick={() => navigate('/notifications')}
              className="relative flex size-[40px] cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
            >
              <Bell size={19} />
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-[24px] bg-white p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
          <div className="flex items-center justify-between px-1">
            <button type="button" aria-label="이전 달">
              <ChevronLeft size={20} color={C.faint} />
            </button>
            <h2 className="text-[16px] font-bold">2026년 10월</h2>
            <button type="button" aria-label="다음 달">
              <ChevronRight size={20} color={C.faint} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[12px] font-semibold">
            {WEEK.map((w, i) => (
              <span
                key={w}
                style={{
                  color: i === 0 ? '#EF4E6C' : i === 6 ? '#2F7BF5' : C.faint,
                }}
              >
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((d, i) => {
              const sel = d === selectedDay
              const today = d === TODAY
              const wd = i % 7
              return (
                <div
                  key={i}
                  onClick={d ? () => setDay(sel ? null : d) : undefined}
                  className="flex h-[44px] cursor-pointer flex-col items-center gap-[3px]"
                >
                  {d && (
                    <>
                      <span
                        className={`flex size-[32px] items-center justify-center rounded-full text-[13.5px] font-semibold ${
                          sel
                            ? 'bg-[#2F7BF5] text-white shadow-[0_4px_10px_rgba(47,123,245,0.4)]'
                            : today
                              ? 'bg-[#EAF2FE] font-bold text-[#2468E0]'
                              : ''
                        }`}
                        style={
                          !sel && !today
                            ? {
                                color: wd === 0 ? '#EF4E6C' : wd === 6 ? '#2F7BF5' : C.text,
                              }
                            : undefined
                        }
                      >
                        {d}
                      </span>
                      <span className="flex gap-[3px]">
                        {(DOTS[d] ?? []).map((c, k) => (
                          <span
                            key={k}
                            className="size-[5px] rounded-full"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[17px] font-bold">
              <Heart size={17} fill="#EF4E6C" color="#EF4E6C" />
              {selectedDay ? `10월 ${selectedDay}일 마감 정책` : '찜한 정책 · 마감순'}
            </h2>
            <span className="text-[13px] font-semibold" style={{ color: C.sub }}>
              {shown.length}건
            </span>
          </div>
          {shown.map((f) => (
            <FavCard
              key={f.id}
              f={{ ...f, selected: f.day === selectedDay }}
              onPick={() => navigate(`/policies/${f.id}`)}
              onUnlike={() => unlike(f.id)}
              onAlarm={() => setEditing(f.id)}
            />
          ))}
          {shown.length === 0 && (
            <p className="py-8 text-center text-[13px]" style={{ color: C.faint }}>
              {selectedDay ? '이 날 마감되는 찜한 정책이 없어요' : '찜한 정책이 없어요'}
            </p>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-40 flex justify-center px-[18px]">
          <div className="flex w-full max-w-[444px] items-center gap-3 rounded-2xl bg-[#18202F]/90 px-4 py-3 text-[13px] font-semibold text-white">
            <span className="flex-1">찜을 해제했어요 · 알림도 취소돼요</span>
            <button type="button" onClick={undo} className="cursor-pointer text-[#8CC4FF]">
              되돌리기
            </button>
          </div>
        </div>
      )}

      {editingFav && (
        <AlarmEditSheet
          title={editingFav.title}
          initial={editingFav.alarms}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            setAlarms((cur) => ({ ...cur, [editingFav.id]: next }))
            setEditing(null)
          }}
        />
      )}

      <BottomNav active="캘린더" />
    </AppShell>
  )
}
