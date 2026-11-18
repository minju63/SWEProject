// src/screens/minju/AlarmSheet.tsx
// lucide-react, ./index 대신 ./icons 와 파일 안 색상 사용
import { Bell } from "./icons"
import { BottomSheet } from "./BottomSheet"

const C = { main: "#2F7BF5", text: "#18202F", sub: "#5F6B80", faint: "#9AA4B5" }

const COLS: { vals: string[]; sel: number; w: string }[] = [
  {
    vals: [
      "10.06 (화)",
      "10.07 (수)",
      "10.08 (목)",
      "10.09 (금)",
      "10.10 (토)",
    ],
    sel: 2,
    w: "flex-[2.2]",
  },
  { vals: ["", "오전", "오후", "", ""], sel: 2, w: "flex-1" },
  { vals: ["7", "8", "9", "10", "11"], sel: 2, w: "flex-1" },
  { vals: ["20", "25", "30", "35", "40"], sel: 2, w: "flex-1" },
]

function Wheel() {
  return (
    <div className="relative rounded-[22px] bg-white px-3 py-2 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
      <div className="absolute inset-x-3 top-1/2 h-[44px] -translate-y-1/2 rounded-[14px] bg-[#EAF2FE]" />
      <div className="relative flex">
        {COLS.map((c, ci) => (
          <div key={ci} className={`${c.w} flex flex-col items-center`}>
            {c.vals.map((v, i) => {
              const d = Math.abs(i - c.sel)
              return (
                <span
                  key={i}
                  className={`flex h-[44px] items-center ${
                    d === 0
                      ? "text-[17px] font-bold text-[#2F7BF5]"
                      : d === 1
                        ? "text-[15px] font-medium text-[#9AA4B5]"
                        : "text-[13px] text-[#9AA4B5]/50"
                  }`}
                >
                  {v}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AlarmSheet({
  onClose,
  onAdd,
  title = "청년 월세 지원",
  deadline = "10.09 (금) 18:00",
}: {
  onClose: () => void
  onAdd?: (label: string) => void
  title?: string
  deadline?: string
}) {
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <div className="flex flex-col gap-4 px-[18px] pb-[42px]">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-bold">직접 정하기</h2>
            <p className="text-[13px]" style={{ color: C.sub }}>
              {title} · 마감{" "}
              <span className="font-semibold text-[#EF4E6C]">{deadline}</span>
            </p>
          </div>
          <Wheel />
          <div className="flex items-center gap-2 rounded-[16px] bg-[#EAF2FE] px-4 py-3.5 text-[13.5px] font-semibold text-[#18202F]">
            <Bell size={17} color={C.main} />
            마감 <span className="text-[#2F7BF5]">20시간 30분 전</span>에
            알려드려요
          </div>
          <div className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-semibold">
                마감까지 매일 이 시간에 반복
              </span>
              <span className="text-[12px]" style={{ color: C.faint }}>
                10.08 하루만 남아 1번 울려요
              </span>
            </div>
            <button
              role="switch"
              aria-checked={false}
              className="flex h-[30px] w-[50px] items-center rounded-full bg-[#D5DCE8] p-[3px]"
            >
              <span className="size-[24px] rounded-full bg-white shadow" />
            </button>
          </div>
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
                onAdd?.("10.08 오후 9:30")
                close()
              }}
              className="h-[54px] flex-[2] cursor-pointer rounded-[16px] bg-[#2F7BF5] text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(47,123,245,0.35)]"
            >
              알림 추가
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export default AlarmSheet
