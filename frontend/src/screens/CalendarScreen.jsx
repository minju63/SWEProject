import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { AppShell, BottomNav } from '../components/PolicyLayout'
import { policyCatalog } from '../data/policies'
import { useAppState } from '../app/AppState'
import { workspaceEvents } from '../data/workspaceCalendar'
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
export default function CalendarScreen() {
  const navigate = useNavigate()
  const { savedPolicies, applications } = useAppState()
  const today = useMemo(
    () =>
      new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) + 'T00:00:00'),
    []
  )
  const [month, setMonth] = useState(startOfMonth(today))
  const [selected, setSelected] = useState(today)
  const events = useMemo(
    () =>
      workspaceEvents(savedPolicies, applications, policyCatalog).map((e) => ({
        ...e,
        date: new Date(e.date + 'T00:00:00'),
      })),
    [savedPolicies, applications]
  )
  const gridStart = startOfWeek(month)
  const weeks = Math.ceil((endOfMonth(month).getDate() + month.getDay()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i))
  const dayEvents = events.filter((e) => isSameDay(e.date, selected))
  const always = policyCatalog.filter(
    (p) => savedPolicies.includes(p.id) && p.recruitmentStatus === '상시'
  )
  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <h1 className="text-xl font-black tracking-[-0.04em]">정책 캘린더</h1>
          <p className="mt-1 text-[11px] font-medium text-black/60">
            찜·신청관리의 마감일, 신청일, 결과 발표일이에요
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(addMonths(month, -1))}
            className="grid size-8 place-items-center rounded-full bg-white text-black/60"
            aria-label="이전 달"
          >
            ‹
          </button>
          <span className="w-20 text-center text-sm font-black">{format(month, 'yyyy. M.')}</span>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            className="grid size-8 place-items-center rounded-full bg-white text-black/60"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </header>

      <section className="mx-5 rounded-[22px] bg-white p-4">
        <div className="grid grid-cols-7 text-center text-[10px] font-extrabold text-black/30">
          {weekdays.map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const has = events.some((e) => isSameDay(e.date, day))
            const isSel = isSameDay(day, selected)
            const isToday = isSameDay(day, today)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelected(day)}
                className="flex flex-col items-center py-1"
              >
                <span
                  className={`grid size-8 place-items-center rounded-full text-xs font-bold ${isSel ? 'bg-[#2F7BF5] text-white' : isToday ? 'bg-[#f1f3fb] text-[#2468E0]' : isSameMonth(day, month) ? 'text-black/70' : 'text-black/20'}`}
                >
                  {day.getDate()}
                </span>
                <span
                  className={`mt-0.5 size-1 rounded-full ${has ? 'bg-[#e0645c]' : 'bg-transparent'}`}
                />
              </button>
            )
          })}
        </div>
      </section>

      <section className="mx-5 mt-5">
        <h2 className="px-1 text-xs font-extrabold text-black/60">
          {format(selected, 'M월 d일')} 일정
        </h2>
        <div className="mt-2 space-y-2">
          {dayEvents.length ? (
            dayEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => navigate(event.policyId ? `/policies/${event.policyId}` : '/my')}
                className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left"
              >
                <span>
                  <small className="text-[10px] font-extrabold text-[#2468E0]">{event.kind}</small>
                  <b className="block text-sm font-extrabold">{event.title}</b>
                </span>
                <span className="rounded-full bg-[#fdeceb] px-2 py-1 text-[10px] font-black text-[#e0645c]">
                  {format(event.date, 'M.d')}
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-2xl bg-white py-6 text-center text-[11px] font-medium text-black/60">
              이 날 등록된 일정이 없어요. 찜하거나 신청관리에 추가해보세요.
            </p>
          )}
        </div>
      </section>

      <section className="mx-5 mb-28 mt-5">
        <h2 className="px-1 text-xs font-extrabold text-black/60">상시 모집</h2>
        <div className="mt-2 space-y-2">
          {always.map((policy) => (
            <button
              key={policy.id}
              onClick={() => navigate(`/policies/${policy.id}`)}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left"
            >
              <b className="text-sm font-extrabold">{policy.title}</b>
              <span className="text-[10px] font-extrabold text-[#2468E0]">상시</span>
            </button>
          ))}
        </div>
      </section>
      <BottomNav active="캘린더" />
    </AppShell>
  )
}
