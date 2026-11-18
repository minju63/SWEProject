import { useEffect, useRef, useState, type RefObject } from "react"
import { X } from "lucide-react"
import { Hannuni } from "./index"

const SIZE = 68
const EDGE = 14
const TOP_LIMIT = 120 // below the app header
const TAB_H = 98
const BOTTOM_LIMIT = TAB_H + 12 // stay 12px above the tab bar
const DEFAULT_BOTTOM = TAB_H + 16
const DRAG_THRESHOLD = 6
const POS_KEY = "minju_hannuni_pos"

type Pos = { side: "left" | "right"; bottom: number }

function loadPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "")
    if (
      (p.side === "left" || p.side === "right") &&
      typeof p.bottom === "number"
    )
      return p
  } catch {}
  return { side: "right", bottom: DEFAULT_BOTTOM }
}

export function FloatingHannuni({
  frameRef,
  onOpen,
  onHide,
  unread = 2,
  showBubble = true,
}: {
  showBubble?: boolean
  frameRef: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onHide: () => void
  unread?: number
}) {
  const [pos, setPos] = useState<Pos>(loadPos)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null) // character center while dragging
  const [overZone, setOverZone] = useState(false)
  const [size, setSize] = useState({ w: 390, h: 844 })
  const g = useRef<{
    id: number
    sx: number
    sy: number
    ox: number
    oy: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [frameRef])

  useEffect(() => {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  }, [pos])

  const minBottom = BOTTOM_LIMIT
  const maxBottom = Math.max(minBottom, size.h - TOP_LIMIT - SIZE)
  const bottom = Math.min(maxBottom, Math.max(minBottom, pos.bottom))
  const restX =
    pos.side === "right" ? size.w - EDGE - SIZE / 2 : EDGE + SIZE / 2
  const restY = size.h - bottom - SIZE / 2
  const cx = drag?.x ?? restX
  const cy = drag?.y ?? restY
  const zone = { x: size.w / 2, y: size.h - BOTTOM_LIMIT - 46 }

  const local = (e: React.PointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const clamp = (x: number, y: number) => ({
    x: Math.min(size.w - EDGE - SIZE / 2, Math.max(EDGE + SIZE / 2, x)),
    y: Math.min(
      size.h - BOTTOM_LIMIT - SIZE / 2,
      Math.max(TOP_LIMIT + SIZE / 2, y),
    ),
  })
  const inZone = (p: { x: number; y: number }) =>
    Math.hypot(p.x - zone.x, p.y - zone.y) < 52

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    g.current = {
      id: e.pointerId,
      sx: p.x,
      sy: p.y,
      ox: p.x - restX,
      oy: p.y - restY,
      moved: false,
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const p = local(e)
    if (!s.moved && Math.hypot(p.x - s.sx, p.y - s.sy) < DRAG_THRESHOLD) return
    s.moved = true
    const c = clamp(p.x - s.ox, p.y - s.oy)
    setDrag(c)
    setOverZone(inZone(c))
  }
  const onUp = (e: React.PointerEvent) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    g.current = null
    if (!s.moved) {
      onOpen()
      return
    }
    const c = drag ?? { x: restX, y: restY }
    setDrag(null)
    setOverZone(false)
    if (inZone(c)) {
      onHide()
      return
    }
    setPos({
      side: c.x < size.w / 2 ? "left" : "right",
      bottom: size.h - c.y - SIZE / 2,
    })
  }
  const onCancel = () => {
    g.current = null
    setDrag(null)
    setOverZone(false)
  }

  const right = pos.side === "right"

  return (
    <>
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-0 bg-black/[0.18]" />
          <div
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
            style={{ left: zone.x, top: zone.y }}
          >
            <span
              className={`flex size-[58px] items-center justify-center rounded-full border-2 border-dashed text-white transition-all duration-150 ${
                overZone
                  ? "scale-125 border-white bg-[#EF4E6C]"
                  : "border-white/80 bg-[#18202F]/85"
              }`}
            >
              <X size={24} strokeWidth={2.6} />
            </span>
          </div>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-[#18202F]/75 px-3 py-1 text-[12px] font-semibold text-white"
            style={{ left: zone.x, top: zone.y + 40 }}
          >
            여기로 끌어 놓으면 숨기기
          </span>
        </div>
      )}

      <div
        className={`absolute z-20 ${
          drag ? "" : "transition-[left,top] duration-300 ease-out"
        }`}
        style={{
          left: cx - SIZE / 2,
          top: cy - SIZE / 2,
          width: SIZE,
          height: SIZE,
        }}
      >
        {!drag && showBubble && unread > 0 && (
          <div
            className={`pointer-events-none absolute top-1/2 w-max -translate-y-1/2 rounded-[18px] bg-white px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug shadow-[0_6px_20px_rgba(47,123,245,0.16)] ${
              right
                ? "right-[calc(100%+8px)] rounded-br-[6px]"
                : "left-[calc(100%+8px)] rounded-bl-[6px]"
            }`}
          >
            마감 임박 혜택이 <span className="text-[#EF4E6C]">{unread}개</span>{" "}
            있어요!
            <br />
            물어볼래요?
          </div>
        )}
        <button
          aria-label="AI 한눈이"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          className={`flex size-full touch-none select-none items-center justify-center rounded-full bg-white transition-[transform,box-shadow] duration-150 ${
            drag
              ? "scale-110 cursor-grabbing shadow-[0_16px_32px_rgba(23,82,190,0.45)] ring-2 ring-[#2F7BF5]/30"
              : "cursor-grab shadow-[0_10px_24px_rgba(47,123,245,0.32)]"
          }`}
        >
          <Hannuni size={54} />
        </button>
        {!drag && (
          <button
            aria-label="한눈이 숨기기"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onHide}
            className="absolute -right-1 -top-1 flex size-[22px] items-center justify-center rounded-full bg-[#9AA4B5] text-[11px] font-bold text-white ring-2 ring-white"
          >
            ✕
          </button>
        )}
      </div>
    </>
  )
}
