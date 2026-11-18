// src/screens/minju/BottomSheet.tsx
// 공용 바텀시트: 300ms 동안 아래에서 올라옴, 손잡이를 아래로 끌거나 어두운 곳을 누르면 닫힘. ✕ 버튼 없음.
// - React 타입을 직접 import (팀 앱에서 React.PointerEvent 오류 방지)
// - sheetUp 애니메이션을 이 파일 안에 정의 (팀 CSS에 없어도 동작)
import { useRef, useState } from 'react'
export const SHEET_KEYFRAMES =
  '@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'
export function BottomSheet({ onClose, height, children }) {
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const start = useRef(null)
  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 250)
  }
  const onDown = (e) => {
    start.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    if (start.current !== null) setDy(Math.max(0, e.clientY - start.current))
  }
  const onUp = () => {
    if (start.current === null) return
    start.current = null
    setDragging(false)
    if (dy > 100) close()
    else setDy(0)
  }
  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col justify-end transition-colors duration-300 ${closing ? 'bg-black/0' : 'bg-black/40'}`}
    >
      <style>{SHEET_KEYFRAMES}</style>
      <button
        type="button"
        aria-label="시트 닫기"
        className="flex-1 cursor-default"
        onClick={close}
      />
      <div
        className={`flex flex-col rounded-t-[28px] bg-[#F6F9FE] ${dragging ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{
          height,
          animation: 'sheetUp 300ms ease-out',
          transform: closing ? 'translateY(100%)' : `translateY(${dy}px)`,
        }}
      >
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="flex h-[26px] shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <span className="h-[5px] w-[40px] rounded-full bg-[#D5DCE8]" />
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  )
}
export default BottomSheet
