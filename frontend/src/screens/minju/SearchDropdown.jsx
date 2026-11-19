import { Clock, X } from 'lucide-react'
import { CategoryRow, C } from './index'
const RECENT = [
  ['월세', '10.04'],
  ['면접 정장', '10.02'],
  ['교통비', '09.28'],
]
export function SearchDropdown() {
  return (
    <div className="absolute inset-x-0 top-[62px] flex flex-col gap-5 rounded-[22px] bg-white p-[18px] shadow-[0_16px_40px_rgba(24,32,47,0.22)]">
      <div className="flex flex-col gap-3">
        <h3 className="text-[13.5px] font-bold">카테고리로 찾기</h3>
        <CategoryRow showCounts={false} bare />
      </div>
      <div className="h-px bg-[#EEF2F8]" />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13.5px] font-bold">최근 검색어</h3>
          <button className="text-[12px] font-medium" style={{ color: C.faint }}>
            전체 삭제
          </button>
        </div>
        {RECENT.map(([w, d]) => (
          <div key={w} className="flex h-[38px] items-center gap-2.5">
            <Clock size={16} color={C.faint} />
            <span className="flex-1 text-[14px] font-medium">{w}</span>
            <span className="text-[12px]" style={{ color: C.faint }}>
              {d}
            </span>
            <button aria-label="삭제">
              <X size={14} color={C.faint} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
