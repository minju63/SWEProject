// src/screens/minju/AlarmSettings.tsx
// 팀 앱 routes.tsx 의 "settings/alarm" 경로에 연결하는 화면
// - default export
// - lucide-react, ./index, ./store 없이 동작
// - 설정은 이 화면이 직접 관리하고 localStorage("minju_alarm_settings_v1")에 저장
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AppShell } from '../../components/PolicyLayout'
import { ChevronLeft, Check } from './icons'
const KEY = 'minju_alarm_settings_v1'
const DEFAULT = {
  auto: ['1일 전', '30분 전'],
  time: '09:00',
  receive: [true, true, true],
}
export function loadAlarmSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const v = JSON.parse(raw)
    return {
      auto: Array.isArray(v.auto) ? v.auto : DEFAULT.auto,
      time: typeof v.time === 'string' ? v.time : DEFAULT.time,
      receive:
        Array.isArray(v.receive) && v.receive.length === 3
          ? v.receive.map(Boolean)
          : DEFAULT.receive,
    }
  } catch {
    return DEFAULT
  }
}
/* ---------- 화면 ---------- */
const C = { text: '#18202F', sub: '#5F6B80', faint: '#9AA4B5' }
const card = 'rounded-[22px] bg-white p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]'
const CHIPS = [
  '1주 전',
  '3일 전',
  '1일 전',
  '당일 오전',
  '3시간 전',
  '1시간 전',
  '30분 전',
  '10분 전',
]
const RECEIVE = [
  ['찜한 정책 마감 알림', null],
  ['새로 맞는 혜택 알림', '내 조건에 맞는 혜택이 새로 올라오면'],
  ['한눈이 말풍선', '홈에서 마감 임박 등 안내'],
]
function Toggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative flex h-[30px] w-[50px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors duration-200 ${on ? 'bg-[#2F7BF5]' : 'bg-[#D5DCE8]'}`}
    >
      <span
        className={`size-[24px] rounded-full bg-white shadow transition-transform duration-200 ease-out ${on ? 'translate-x-[20px]' : ''}`}
      />
    </button>
  )
}
const timeLabel = (t) => {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return t
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, '0')}`
}
export default function AlarmSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(loadAlarmSettings)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* 저장 못 해도 화면은 동작 */
    }
  }, [settings])
  useEffect(() => {
    if (!saved) return
    const t = window.setTimeout(() => setSaved(false), 1500)
    return () => window.clearTimeout(t)
  }, [saved])
  const update = (next) => {
    setSettings(next)
    setSaved(true)
  }
  const toggleAuto = (v) =>
    update({
      ...settings,
      auto: settings.auto.includes(v)
        ? settings.auto.filter((x) => x !== v)
        : [...settings.auto, v],
    })
  const toggleRecv = (i) => {
    const r = [...settings.receive]
    r[i] = !r[i]
    update({ ...settings, receive: r })
  }
  return (
    <AppShell>
      <div className="flex flex-col gap-4 px-[18px] pb-28 pt-2" style={{ color: C.text }}>
        <header className="-ml-1.5 flex h-[48px] items-center gap-1">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate(-1)}
            className="-m-2 flex size-[44px] cursor-pointer items-center justify-center"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="flex-1 text-[20px] font-bold">기본 알림 설정</h1>
          {saved && <span className="text-[12px] font-semibold text-[#1E9E6A]">저장됨</span>}
        </header>

        <section className={`${card} flex flex-col gap-3.5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15.5px] font-bold">찜할 때 자동으로 걸 알림</h2>
            <span className="text-[12px]" style={{ color: C.faint }}>
              여러 개 선택
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((v) => {
              const on = settings.auto.includes(v)
              return (
                <button
                  type="button"
                  key={v}
                  aria-pressed={on}
                  onClick={() => toggleAuto(v)}
                  className={`flex h-[38px] cursor-pointer items-center justify-center gap-1 rounded-full px-3.5 text-[13px] font-semibold ${
                    on
                      ? 'bg-[#2F7BF5] text-white shadow-[0_4px_12px_rgba(47,123,245,0.3)]'
                      : 'bg-[#F2F4F8] text-[#5F6B80]'
                  }`}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                  {v}
                </button>
              )
            })}
          </div>
          <p
            className="rounded-[12px] bg-[#F6F8FB] px-3 py-2.5 text-[12px]"
            style={{ color: C.faint }}
          >
            새로 찜하는 정책부터 적용 · 정책마다 캘린더에서 따로 바꿀 수 있어요
          </p>
        </section>

        <label className={`${card} flex cursor-pointer items-center gap-3`}>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[14.5px] font-bold">"며칠 전" 알림 시각</span>
            <span className="text-[12px]" style={{ color: C.faint }}>
              1주 전 · 3일 전 · 1일 전 · 당일 오전 알림이 울리는 시간
            </span>
          </div>
          <span className="relative flex items-center text-[14px] font-bold text-[#2468E0]">
            {timeLabel(settings.time)}
            <input
              type="time"
              value={settings.time}
              onChange={(e) => e.target.value && update({ ...settings, time: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="알림 시각"
            />
          </span>
        </label>

        <section className={`${card} flex flex-col`}>
          <h2 className="pb-1 text-[15.5px] font-bold">받을 알림</h2>
          {RECEIVE.map(([t, s], i) => (
            <div
              key={t}
              className={`flex min-h-[56px] items-center gap-3 py-2 ${i ? 'border-t border-[#EEF2F8]' : ''}`}
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-semibold">{t}</span>
                {s && (
                  <span className="text-[12px]" style={{ color: C.faint }}>
                    {s}
                  </span>
                )}
              </div>
              <Toggle on={settings.receive[i]} onClick={() => toggleRecv(i)} label={t} />
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  )
}
