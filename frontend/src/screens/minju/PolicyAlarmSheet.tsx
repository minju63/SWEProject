import { useState } from "react"
import { Bell, Check, CalendarClock, X, ChevronRight } from "lucide-react"
import { C } from "./index"
import { BottomSheet } from "./BottomSheet"
import { AlarmSheet } from "./AlarmSheet"
import { QUICK, isPast, type Policy } from "./store"

export function PolicyAlarmSheet({
  policy,
  initial,
  onSave,
  onClose,
}: {
  policy: Policy
  initial: string[]
  onSave: (list: string[]) => void
  onClose: () => void
}) {
  const [list, setList] = useState(initial)
  const [direct, setDirect] = useState(false)
  const toggle = (l: string) =>
    setList((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))

  return (
    <>
      <BottomSheet onClose={onClose}>
        {(close) => (
          <div className="flex flex-col gap-4 px-[18px] pb-[42px]">
            <div className="flex flex-col gap-1">
              <h2 className="text-[20px] font-bold">알림 설정</h2>
              <p className="text-[13px]" style={{ color: C.sub }}>
                {policy.title} · 마감{" "}
                <span className="font-semibold text-[#EF4E6C]">
                  {policy.meta.split(" · ")[0]}
                </span>
              </p>
            </div>

            <section className="flex flex-col rounded-[20px] bg-white px-4 py-1 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
              {list.length === 0 && (
                <p
                  className="py-4 text-center text-[13px]"
                  style={{ color: C.faint }}
                >
                  설정된 알림이 없어요
                </p>
              )}
              {list.map((l, i) => (
                <div
                  key={l}
                  className={`flex items-center gap-2.5 ${
                    i ? "border-t border-[#EEF2F8]" : ""
                  }`}
                >
                  <Bell size={16} color={C.main} />
                  <span className="flex-1 text-[14px] font-semibold">
                    마감 {l}
                  </span>
                  <button
                    aria-label={`${l} 알림 삭제`}
                    onClick={() => toggle(l)}
                    className="-mr-2 flex size-[44px] cursor-pointer items-center justify-center"
                  >
                    <span className="flex size-[24px] items-center justify-center rounded-full bg-[#F2F4F8]">
                      <X size={13} strokeWidth={2.6} color={C.sub} />
                    </span>
                  </button>
                </div>
              ))}
            </section>

            <div className="flex flex-col gap-2.5">
              <h3 className="text-[14px] font-bold">빠르게 추가</h3>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((l) => {
                  const past = isPast(l, policy.deadline),
                    on = list.includes(l)
                  return (
                    <button
                      key={l}
                      disabled={past}
                      onClick={() => toggle(l)}
                      className={`relative flex h-[38px] items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold after:absolute after:-inset-y-[3px] after:inset-x-0 after:content-[''] ${
                        past
                          ? "cursor-not-allowed bg-[#EEF1F5] text-[#C4CBD6] line-through"
                          : on
                            ? "cursor-pointer bg-[#2F7BF5] text-white shadow-[0_4px_12px_rgba(47,123,245,0.3)]"
                            : "cursor-pointer border border-[#E1E7F0] bg-white text-[#5F6B80]"
                      }`}
                    >
                      {on && !past && <Check size={14} strokeWidth={3} />}
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => setDirect(true)}
              className="flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-[18px] bg-white px-4 text-left text-[14px] font-semibold shadow-[0_6px_20px_rgba(47,123,245,0.08)]"
            >
              <CalendarClock size={18} color={C.main} />
              <span className="flex-1">날짜·시간 직접 정하기</span>
              <ChevronRight size={18} color={C.faint} />
            </button>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={close}
                className="h-[54px] flex-1 cursor-pointer rounded-[16px] bg-[#E8ECF2] text-[15px] font-bold"
                style={{ color: C.sub }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  onSave(list)
                  close()
                }}
                className="h-[54px] flex-[2] cursor-pointer rounded-[16px] bg-[#2F7BF5] text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(47,123,245,0.35)]"
              >
                저장
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
      {direct && (
        <AlarmSheet
          title={policy.title}
          deadline={policy.meta.split(" · ")[0]}
          onAdd={(l) => setList((x) => (x.includes(l) ? x : [...x, l]))}
          onClose={() => setDirect(false)}
        />
      )}
    </>
  )
}
