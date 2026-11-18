import { useRef } from 'react'
export function DragScroll({ className = '', children, style, role, ariaLabel }) {
  const ref = useRef(null)
  const st = useRef({ down: false, x: 0, left: 0, moved: false })
  return (
    <div
      ref={ref}
      style={style}
      role={role}
      aria-label={ariaLabel}
      className={`${className} cursor-grab select-none active:cursor-grabbing`}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        st.current = {
          down: true,
          x: e.clientX,
          left: ref.current.scrollLeft,
          moved: false,
        }
        ref.current.style.scrollSnapType = 'none'
      }}
      onPointerMove={(e) => {
        const s = st.current
        if (!s.down || !ref.current) return
        const dx = e.clientX - s.x
        if (Math.abs(dx) > 5) s.moved = true
        ref.current.scrollLeft = s.left - dx
      }}
      onPointerUp={() => {
        st.current.down = false
        if (ref.current) ref.current.style.scrollSnapType = ''
      }}
      onPointerLeave={() => {
        st.current.down = false
        if (ref.current) ref.current.style.scrollSnapType = ''
      }}
      onClickCapture={(e) => {
        if (st.current.moved) {
          e.stopPropagation()
          e.preventDefault()
          st.current.moved = false
        }
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}
