import { X } from 'lucide-react'
import { Hannuni } from './index'
/* 390×844 frame coordinates */
const FROM = { x: 342, y: 710 } // original FAB center (right 14, bottom 100, 68px)
const TO = { x: 66, y: 430 } // dragged position near "카테고리로 둘러보기"
export function DragOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-0 bg-black/[0.18]" />

      <svg className="absolute inset-0" width="390" height="844" viewBox="0 0 390 844">
        <path
          d={`M ${FROM.x} ${FROM.y} C ${FROM.x - 40} ${FROM.y - 190}, ${TO.x + 150} ${TO.y + 60}, ${TO.x + 44} ${TO.y + 6}`}
          fill="none"
          stroke="#2F7BF5"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="2 7"
        />
        <circle
          cx={FROM.x}
          cy={FROM.y}
          r="34"
          fill="rgba(255,255,255,0.35)"
          stroke="#2F7BF5"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
      </svg>

      {/* dragged Hannuni */}
      <div className="absolute flex items-center gap-3" style={{ left: TO.x - 34, top: TO.y - 34 }}>
        <span className="flex size-[68px] scale-110 items-center justify-center rounded-full bg-white shadow-[0_16px_32px_rgba(23,82,190,0.55)] ring-2 ring-[#2F7BF5]/30">
          <Hannuni size={54} />
        </span>
        <span className="relative rounded-[14px] bg-[#18202F] px-3 py-2 text-[12.5px] font-semibold text-white shadow-lg">
          <span className="absolute -left-1 top-1/2 size-2.5 -translate-y-1/2 rotate-45 bg-[#18202F]" />
          놓으면 가까운 가장자리에 붙어요
        </span>
      </div>

      {/* delete zone above tab bar */}
      <div className="absolute inset-x-0 bottom-[132px] flex flex-col items-center gap-2">
        <span className="flex size-[58px] items-center justify-center rounded-full border-2 border-dashed border-white/80 bg-[#18202F]/85 text-white">
          <X size={24} strokeWidth={2.6} />
        </span>
        <span className="rounded-full bg-[#18202F]/70 px-3 py-1 text-[12px] font-semibold text-white">
          여기로 끌어 놓으면 숨기기
        </span>
      </div>
    </div>
  )
}
