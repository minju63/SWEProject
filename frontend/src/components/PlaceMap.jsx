import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
export const MAP_MIN_LEVEL = 0
export const MAP_MAX_LEVEL = 6
const ZOOM_BASE = 11
const CLUSTER_RADIUS = 46
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
export default function PlaceMap({
  viewport,
  onViewportChange,
  markers,
  selectedId,
  onSelectMarker,
  myLocation,
  bottomInset = 0,
  topInset = 0,
  interactive = true,
  className = '',
}) {
  const rootRef = useRef(null)
  const mapRef = useRef(null)
  const [, setTick] = useState(0)
  const [popup, setPopup] = useState(null)
  const latest = useRef({ viewport, onViewportChange, onSelectMarker, topInset, bottomInset })
  latest.current = { viewport, onViewportChange, onSelectMarker, topInset, bottomInset }
  const centerShift = () => (latest.current.topInset - latest.current.bottomInset) / 2
  function applyViewport(map, vp, animate) {
    const zoom = ZOOM_BASE + clamp(vp.level, MAP_MIN_LEVEL, MAP_MAX_LEVEL)
    const px = map.project([vp.lat, vp.lng], zoom).subtract([0, centerShift()])
    map.setView(map.unproject(px, zoom), zoom, { animate })
  }
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 1,
      minZoom: ZOOM_BASE + MAP_MIN_LEVEL,
      maxZoom: ZOOM_BASE + MAP_MAX_LEVEL,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: false,
      keyboard: false,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    mapRef.current = map
    applyViewport(map, latest.current.viewport, false)
    const sync = () => setTick((n) => n + 1)
    map.on('move zoom resize', sync)
    map.on('moveend', () => {
      const zoom = map.getZoom()
      const c = map.project(map.getCenter(), zoom).add([0, centerShift()])
      const ll = map.unproject(c, zoom)
      const level = zoom - ZOOM_BASE
      const cur = latest.current.viewport
      if (
        Math.abs(ll.lat - cur.lat) > 1e-6 ||
        Math.abs(ll.lng - cur.lng) > 1e-6 ||
        level !== cur.level
      )
        latest.current.onViewportChange({ lat: ll.lat, lng: ll.lng, level })
      sync()
    })
    map.on('click', () => {
      setPopup(null)
      latest.current.onSelectMarker(null)
    })
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(el)
    sync()
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    setPopup((cur) => (cur && cur.level !== viewport.level ? null : cur))
  }, [viewport.level])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const zoom = map.getZoom()
    const c = map.project(map.getCenter(), zoom).add([0, centerShift()])
    const ll = map.unproject(c, zoom)
    if (
      Math.abs(ll.lat - viewport.lat) > 1e-5 ||
      Math.abs(ll.lng - viewport.lng) > 1e-5 ||
      zoom !== ZOOM_BASE + viewport.level
    )
      applyViewport(map, viewport, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.lat, viewport.lng, viewport.level, topInset, bottomInset])
  const map = mapRef.current
  const size = map ? map.getSize() : { x: 0, y: 0 }
  const toPoint = (ll) => {
    const p = map.latLngToContainerPoint([ll.lat, ll.lng])
    return { x: p.x, y: p.y }
  }
  const { pins, clusters, selected } = (() => {
    if (!map) return { pins: [], clusters: [], selected: null }
    const items = []
    let selectedItem = null
    for (const marker of markers) {
      const { x, y } = toPoint(marker)
      if (x < -30 || y < -30 || x > size.x + 30 || y > size.y + 60) continue
      const item = { marker, x, y }
      if (marker.id === selectedId) selectedItem = item
      else items.push(item)
    }
    const used = items.map(() => false)
    const pinItems = []
    const clusterGroups = []
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue
      const group = [items[i]]
      used[i] = true
      for (let j = i + 1; j < items.length; j++) {
        if (used[j]) continue
        if (Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y) < CLUSTER_RADIUS) {
          group.push(items[j])
          used[j] = true
        }
      }
      if (group.length === 1) pinItems.push(group[0])
      else clusterGroups.push(group)
    }
    return { pins: pinItems, clusters: clusterGroups, selected: selectedItem }
  })()
  function onMarkerClick(event, id) {
    event.stopPropagation()
    onSelectMarker(id)
  }
  function onClusterClick(event, group) {
    event.stopPropagation()
    const lat = group.reduce((sum, item) => sum + item.marker.lat, 0) / group.length
    const lng = group.reduce((sum, item) => sum + item.marker.lng, 0) / group.length
    const ids = group.map((item) => item.marker.id)
    setPopup((cur) =>
      cur && cur.ids.join() === ids.join() ? null : { ids, lat, lng, level: viewport.level }
    )
  }
  function renderPin(item, isSelected) {
    const { marker } = item
    return (
      <button
        key={marker.id}
        type="button"
        tabIndex={interactive ? 0 : -1}
        disabled={!interactive}
        onClick={(event) => onMarkerClick(event, marker.id)}
        aria-label={marker.label + (marker.saved ? ' (찜함)' : '')}
        aria-pressed={isSelected}
        className="pointer-events-auto absolute left-0 top-0 size-0 p-0"
        style={{
          transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
          zIndex: isSelected ? 10000 : 10 + Math.round(item.y),
        }}
      >
        <CategoryPin
          kind={marker.kind}
          color={marker.color}
          className={`absolute -left-[16px] -top-[40px] h-10 w-8 origin-bottom overflow-visible transition-transform duration-200 ${isSelected ? 'scale-[1.3]' : ''}`}
          style={{
            filter: isSelected
              ? 'drop-shadow(0 3px 5px rgba(23,25,35,0.4))'
              : 'drop-shadow(0 2px 3px rgba(23,25,35,0.3))',
          }}
        />
        {marker.saved && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`absolute size-[15px] ${isSelected ? 'left-[4px] -top-[56px]' : 'left-[6px] -top-[46px]'}`}
          >
            <path
              d="M12 20.8s-8.2-5-9.9-10.2C1 7 3.3 3.8 6.8 3.8c2.1 0 3.9 1.2 5.2 3.2 1.3-2 3.1-3.2 5.2-3.2 3.5 0 5.8 3.2 4.7 6.8C20.2 15.8 12 20.8 12 20.8z"
              fill="#e5445f"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    )
  }
  const popupInfo = (() => {
    if (!map || !popup || popup.level !== viewport.level) return null
    const group = markers.filter((m) => popup.ids.includes(m.id))
    if (group.length === 0) return null
    const p = toPoint(popup)
    const diameter = 34 + Math.min(popup.ids.length, 9) * 2
    const width = 220
    const left = clamp(p.x - width / 2, 8, Math.max(8, size.x - width - 8))
    return { group, left, top: p.y + diameter / 2 + 8, width, arrowX: p.x - left }
  })()
  const me = map && myLocation ? toPoint(myLocation) : null
  return (
    <div className={`absolute inset-0 isolate z-0 overflow-hidden bg-[#eceef4] ${className}`}>
      <div
        ref={rootRef}
        role="application"
        aria-label="부산 지도"
        className="absolute inset-0 z-0"
      />
      <div className="pointer-events-none absolute inset-0 z-[500] overflow-hidden">
        {me && (
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate3d(${me.x}px, ${me.y}px, 0)`, zIndex: 5 }}
            aria-label="내 위치"
          >
            <span className="absolute -left-5 -top-5 size-10 animate-ping rounded-full bg-[#2f7df6]/20 motion-reduce:animate-none" />
            <span className="absolute -left-2 -top-2 size-4 rounded-full border-[3px] border-white bg-[#2f7df6] shadow-[0_2px_8px_rgba(47,125,246,0.5)]" />
          </div>
        )}

        {pins.map((item) => renderPin(item, false))}

        {clusters.map((group) => {
          const x = group.reduce((sum, item) => sum + item.x, 0) / group.length
          const y = group.reduce((sum, item) => sum + item.y, 0) / group.length
          const diameter = 34 + Math.min(group.length, 9) * 2
          return (
            <button
              key={`cluster-${group[0].marker.id}`}
              type="button"
              tabIndex={interactive ? 0 : -1}
              disabled={!interactive}
              onClick={(event) => onClusterClick(event, group)}
              aria-label={`장소 ${group.length}곳 묶음, 누르면 확대`}
              className="pointer-events-auto absolute left-0 top-0 size-0 p-0"
              style={{ transform: `translate3d(${x}px, ${y}px, 0)`, zIndex: 5000 }}
            >
              <span
                className="absolute grid place-items-center rounded-full border-[3px] border-white bg-[#2F7BF5] text-[13px] font-extrabold text-white shadow-[0_2px_8px_rgba(23,25,35,0.28)]"
                style={{
                  width: diameter,
                  height: diameter,
                  left: -diameter / 2,
                  top: -diameter / 2,
                }}
              >
                {group.length}
              </span>
            </button>
          )
        })}

        {selected && renderPin(selected, true)}

        {popupInfo && (
          <div
            role="listbox"
            aria-label="묶인 장소 목록"
            className="pointer-events-auto absolute left-0 top-0 rounded-xl bg-white p-1 shadow-[0_6px_20px_rgba(23,25,35,0.25)]"
            style={{
              transform: `translate3d(${popupInfo.left}px, ${popupInfo.top}px, 0)`,
              width: popupInfo.width,
              zIndex: 20000,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <span
              className="absolute -top-1.5 size-3 rotate-45 bg-white"
              style={{ left: clamp(popupInfo.arrowX, 14, popupInfo.width - 14) - 6 }}
            />
            <ul className="relative max-h-[180px] overflow-y-auto">
              {popupInfo.group.map((m) => (
                <li key={m.id}>
                  <button
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setPopup(null)
                      onSelectMarker(m.id)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left active:bg-black/5"
                  >
                    <CategoryBadge kind={m.kind} color={m.color} className="size-6 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">
                      {m.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
function pinGlyph(kind) {
  switch (kind) {
    case 'culture':
      return <path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5" />
    case 'library':
      return (
        <path d="M4 5.5C7 4.5 10 5 12 7c2-2 5-2.500 8-1.500V19c-3-1-6-.5-8 1.500-2-2-5-2.500-8-1.500zM12 7v13" />
      )
    case 'sports':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16" />
        </>
      )
    case 'public_facility':
      return <path d="M5 20V8l7-4 7 4v12M9 20v-4h6v4M9 11h.01M15 11h.01" />
    case 'youth_space':
      return (
        <>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.200" />
          <path d="M3.500 19c.5-3.500 2.700-5 5.500-5s5 1.500 5.500 5M15.500 14.500c2.500 0 4.300 1.200 5 4" />
        </>
      )
    default:
      return <circle cx="12" cy="12" r="4" />
  }
}
export function CategoryPin({ kind, color, className, style }) {
  return (
    <svg viewBox="0 0 28 36" aria-hidden="true" className={className} style={style}>
      <path
        d="M14 35C14 35 2 21.5 2 13.5a12 12 0 0 1 24 0C26 21.5 14 35 14 35z"
        fill={color}
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="13.5" r="8" fill="#fff" />
      <g
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(14 13.5) scale(0.5) translate(-12 -12)"
      >
        {pinGlyph(kind)}
      </g>
    </svg>
  )
}
export function CategoryBadge({ kind, color, className }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <circle cx="14" cy="14" r="12.5" fill={color} stroke="#fff" strokeWidth="1.5" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(14 14) scale(0.68) translate(-12 -12)"
      >
        {pinGlyph(kind)}
      </g>
    </svg>
  )
}
