import { AlarmClock, Sparkles, Bell, Settings, ChevronRight } from 'lucide-react'
import { C } from './index'
import { BottomSheet } from './BottomSheet'
import { NOTI_NEW, NOTI_OLD } from './data'
const ICONS = { alarm: AlarmClock, sparkles: Sparkles }
const NEW = NOTI_NEW.map((x) => ({ ...x, Icon: ICONS[x.icon] }))
const OLD = NOTI_OLD
export function NotiSheet({ onClose, read, onRead }) {
  const unread = NEW.length - read.length
  return (
    <BottomSheet onClose={onClose} height="75%">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] pb-[34px] [scrollbar-width:none]">
        <div className="flex items-center justify-between py-1">
          <h2 className="text-[20px] font-bold">
            알림 {unread > 0 && <span className="text-[#C93454]">{unread}</span>}
          </h2>
          <button
            onClick={() => NEW.forEach((_, i) => onRead(i))}
            className="text-[13px] font-semibold text-[#2468E0]"
          >
            모두 읽음
          </button>
        </div>
        {NEW.map(({ Icon, color, bg, title, sub, time }, i) => (
          <button
            key={i}
            onClick={() => onRead(i)}
            className="relative flex shrink-0 gap-3 rounded-[20px] bg-white py-4 pl-6 pr-4 text-left shadow-[0_6px_20px_rgba(47,123,245,0.08)]"
          >
            {!read.includes(i) && (
              <span className="absolute left-2.5 top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-[#EF4E6C]" />
            )}
            <span
              className="flex size-[40px] shrink-0 items-center justify-center rounded-full"
              style={{ background: bg }}
            >
              <Icon size={20} color={color} strokeWidth={2.3} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[14px] font-bold leading-snug">{title}</p>
                <span className="shrink-0 text-[11.5px]" style={{ color: C.faint }}>
                  {time}
                </span>
              </div>
              <p className="text-[12.5px]" style={{ color: C.sub }}>
                {sub}
              </p>
            </div>
          </button>
        ))}
        <h3 className="pt-2 text-[13px] font-semibold" style={{ color: C.faint }}>
          이전 알림
        </h3>
        {OLD.map((n) => (
          <div
            key={n.title}
            className="flex shrink-0 gap-3 rounded-[20px] border border-[#DDE4EE] px-4 py-3.5"
          >
            <span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#EEF2F7]">
              <Bell size={17} color={C.faint} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[13.5px] font-semibold" style={{ color: C.sub }}>
                  {n.title}
                </p>
                <span className="shrink-0 text-[11.5px]" style={{ color: C.faint }}>
                  {n.time}
                </span>
              </div>
              <p className="text-[12px]" style={{ color: C.faint }}>
                {n.sub}
              </p>
            </div>
          </div>
        ))}
        <button className="mt-1 flex h-[52px] shrink-0 items-center gap-2 rounded-[18px] bg-white px-4 text-[13.5px] shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
          <Settings size={17} color={C.sub} />
          <span className="font-semibold">기본 알림 설정</span>
          <span className="flex-1 text-left" style={{ color: C.faint }}>
            · 1일 전 · 30분 전
          </span>
          <ChevronRight size={17} color={C.faint} />
        </button>
      </div>
    </BottomSheet>
  )
}
