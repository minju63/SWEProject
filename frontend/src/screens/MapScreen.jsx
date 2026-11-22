import NotificationBell from '../components/NotificationBell'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DragScroll } from './minju/DragScroll'
import { useNavigate, useSearchParams } from 'react-router'
import {useQuery} from '@tanstack/react-query'
import {personalApi} from '../lib/api'
import {busanRegions} from '../data/regions'
import { useAuth } from '../lib/auth'
import { BottomNav } from '../components/PolicyLayout'
import PlaceMap, { CategoryBadge, MAP_MAX_LEVEL, MAP_MIN_LEVEL } from '../components/PlaceMap'
import { GENRE_LABEL, eventPeriod, isOngoing, liveEvents } from '../data/events'
import {
  CATEGORIES,
  getFeeType,
  USER_POSITIONS,
  catOf,
  distanceMeters,
  formatDistance,
  kakaoLink,
  places,
} from '../data/places'
import { Icon } from './HomeScreen'
const STOPS = ['collapsed', 'mid', 'full']
const COLLAPSED_HEIGHT = 88
const BAR_HEIGHT = 56
const CARD_HEIGHT = 244
const LOCATION_STATES = ['ok-saha', 'ok-busanjin', 'denied', 'failed', 'outside']
const START_LEVEL = 2
function districtView(district) {
  const matching = places.filter((place) => place.district === district)
  const list=matching.length?matching:places
  if(!list.length)return {lat:35.1796,lng:129.0756,level:6}
  return {
    lat: list.reduce((sum, place) => sum + place.lat, 0) / list.length,
    lng: list.reduce((sum, place) => sum + place.lng, 0) / list.length,
    level: START_LEVEL,
  }
}
function sheetHeights(regionHeight) {
  const full = Math.max(regionHeight - BAR_HEIGHT, COLLAPSED_HEIGHT + 160)
  const mid = Math.min(Math.max(Math.round(regionHeight * 0.46), 230), full - 60)
  return { collapsed: COLLAPSED_HEIGHT, mid, full }
}
function Glyph({ name, className = 'size-5' }) {
  const paths = {
    pin: (
      <>
        <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    ),
    phone: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    locate: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="7.5" />
      </>
    ),
    locateOff: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="7.5" />
        <path d="m3 3 18 18" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2.5" />
        <path d="M8 11V7.5a4 4 0 0 1 8 0V11M12 15.5v2" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    won: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8 9 1.5 6 2.5-5 2.5 5L16 9" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8.5" r="3" />
        <path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" />
        <path d="M16 6a3 3 0 0 1 0 5.5M17.5 14.7c1.7.5 2.7 1.8 3 4.3" />
      </>
    ),
    link: (
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
      </>
    ),
    ticket: (
      <path d="M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1Zm9-2v12" />
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
function EventChip({ event }) {
  return (
    <span
      className={`text-[12px] font-extrabold ${isOngoing(event) ? 'text-[#a0672a]' : 'text-[#2468E0]'}`}
    >
      {isOngoing(event) ? '진행 중' : '예정'}
    </span>
  )
}
function CategoryTag({ place }) {
  const cat = catOf(place.category)
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-extrabold"
      style={{
        color: cat.color,
        borderColor: `color-mix(in srgb, ${cat.color} 45%, white)`,
        backgroundColor: `color-mix(in srgb, ${cat.color} 8%, white)`,
      }}
    >
      {cat.label}
    </span>
  )
}
function HeartButton({ place, saved, onToggle, className = 'size-10' }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={saved}
      aria-label={saved ? `${place.name} 찜 해제` : `${place.name} 찜하기`}
      className={`grid shrink-0 place-items-center rounded-full transition active:scale-90 ${className} ${saved ? 'text-[#e5445f]' : 'text-black/60'}`}
    >
      <Icon name="heart" className={`size-[22px] ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}
function PlaceRow({ place, distance, selected, saved, onSelect, onToggleSaved, cardRef }) {
  const cat = catOf(place.category)
  const eventCount = liveEvents(place.id).length
  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`flex cursor-pointer items-center gap-3 border-b border-black/[0.06] px-5 py-3.5 transition ${selected ? 'bg-[#f1f3fb]' : 'bg-white'}`}
    >
      <CategoryBadge kind={place.category} color={cat.color} className="size-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-black tracking-[-0.03em]">{place.name}</h3>
        <p className="mt-0.5 truncate text-[12px] font-medium text-black/60">
          {cat.label}
          {place.address && ` · ${place.address}`}
          {eventCount > 0 && ` · 행사 ${eventCount}`}
        </p>
      </div>
      {distance !== null && (
        <span className="shrink-0 text-[13px] font-extrabold text-[#a0672a]">
          {formatDistance(distance)}
        </span>
      )}
      <HeartButton place={place} saved={saved} onToggle={onToggleSaved} />
    </div>
  )
}
function PlaceSummary({ place, distance, saved, onToggleSaved, onOpen, onClose }) {
  const first = liveEvents(place.id)[0]
  return (
    <div className="px-5 pb-5 pt-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CategoryTag place={place} />
            {first && <EventChip event={first} />}
          </div>
          <h3 className="mt-2 text-[18px] font-black tracking-[-0.03em]">{place.name}</h3>
        </div>
        <HeartButton place={place} saved={saved} onToggle={onToggleSaved} />
        <button
          type="button"
          onClick={onClose}
          aria-label="선택 닫기"
          className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-black/60"
        >
          <Glyph name="close" className="size-5" />
        </button>
      </div>
      {place.address && (
        <p className="mt-1.5 text-[13px] font-medium text-black/60">{place.address}</p>
      )}
      {distance !== null && (
        <p className="mt-2 text-[14px] font-extrabold text-[#a0672a]">{formatDistance(distance)}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 rounded-xl bg-[#2F7BF5] py-3 text-[14px] font-black text-white transition active:scale-[0.98]"
        >
          상세보기
        </button>
        <a
          href={kakaoLink(place)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-xl border border-[#2F7BF5] bg-white py-3 text-center text-[14px] font-black text-[#2468E0] transition active:scale-[0.98]"
        >
          길찾기
        </a>
      </div>
    </div>
  )
}
function DetailRow({ label, children }) {
  return (
    <div className="flex gap-4 border-t border-black/[0.07] py-3.5 text-[14px]">
      <span className="w-14 shrink-0 font-medium text-black/60">{label}</span>
      <div className="min-w-0 flex-1 break-words font-semibold text-black/80">{children}</div>
    </div>
  )
}
function dataSource(place) {
  const lines = []
  if (place.category === 'library')
    lines.push('전국도서관표준데이터 (제공기관: 지방자치단체·교육청, 저작자표시 CC BY)')
  else if (place.category === 'culture')
    lines.push('부산광역시 공연장·전시공간 목록 (제공기관: 부산광역시)')
  else if (place.category === 'youth_space')
    lines.push('부산청년포털 청년공간 (young.busan.go.kr/space), 사하구 창업 (saha.go.kr/startup)')
  else lines.push('전국공공시설개방정보표준데이터 (제공기관: 지방자치단체)')
  if (liveEvents(place.id).length > 0)
    lines.push('부산광역시 문화 행사 목록 (제공기관: 부산광역시)')
  return lines.join(' / ')
}
function PlaceDetail({ place, distance, saved, onToggleSaved, onClose }) {
  const events = liveEvents(place.id)
  const [openEventId, setOpenEventId] = useState(null)
  const link = 'text-[#2468E0] underline underline-offset-2'
  return (
    <div
      role="dialog"
      aria-label={`${place.name} 상세`}
      className="absolute inset-0 z-40 flex flex-col bg-white"
    >
      <div className="flex h-[56px] shrink-0 items-center gap-1 border-b border-black/[0.07] bg-white px-3">
        <button
          onClick={onClose}
          aria-label="뒤로가기"
          className="grid size-10 place-items-center rounded-full"
        >
          <Glyph name="back" className="size-6" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-black tracking-[-0.03em]">
          장소 상세
        </h2>
        <HeartButton place={place} saved={saved} onToggle={onToggleSaved} />
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-5">
        <div className="flex items-center gap-2 text-[12px] font-medium text-black/60">
          <CategoryTag place={place} />
          <span>{place.placeType}</span>
          {distance !== null && (
            <span className="font-extrabold text-[#a0672a]">{formatDistance(distance)}</span>
          )}
        </div>
        <h3 className="mt-3 text-[26px] font-black leading-tight tracking-[-0.04em]">
          {place.name}
        </h3>
        <a
          href={kakaoLink(place)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg bg-[#2F7BF5] px-6 py-3 text-[14px] font-black text-white"
        >
          길찾기
        </a>

        <section className="mt-5 border-b border-black/[0.07]">
          {place.address && <DetailRow label="주소">{place.address}</DetailRow>}
          {place.tel && (
            <DetailRow label="전화">
              <a href={`tel:${place.tel}`} className={link}>
                {place.tel}
              </a>
            </DetailRow>
          )}
          {place.homepage && (
            <DetailRow label="홈페이지">
              <a href={place.homepage} target="_blank" rel="noreferrer" className={link}>
                공식 홈페이지 열기
              </a>
            </DetailRow>
          )}
          {!place.tel && !place.homepage && (
            <DetailRow label="문의처">문의처 정보가 없어요</DetailRow>
          )}
          {place.openHours && <DetailRow label="운영시간">{place.openHours}</DetailRow>}
          {place.closedDays && <DetailRow label="휴관일">{place.closedDays}</DetailRow>}
          {(place.fee || place.isFree) && <DetailRow label="요금">{place.fee || '무료'}</DetailRow>}
          {place.capacity !== null && (
            <DetailRow label="정원">{place.capacity.toLocaleString()}명</DetailRow>
          )}
          {place.reservationUrl && (
            <DetailRow label="예약">
              <a href={place.reservationUrl} target="_blank" rel="noreferrer" className={link}>
                예약 페이지 열기
              </a>
            </DetailRow>
          )}
        </section>

        <h4 className="mb-3 mt-6 text-[15px] font-black tracking-[-0.03em]">진행·예정 행사</h4>
        {events.length === 0 ? (
          <p className="py-6 text-center text-[13px] font-medium text-black/60">
            진행 중이거나 예정된 행사가 없어요
          </p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-black/[0.1] p-4">
                <p className="flex items-center gap-2">
                  <EventChip event={event} />
                  <span className="text-[12px] font-extrabold text-black/60">
                    {GENRE_LABEL[event.genre]}
                  </span>
                </p>
                <p className="mt-1.5 text-[15px] font-black leading-snug tracking-[-0.03em]">
                  {event.title}
                </p>
                <p className="mt-1.5 text-[13px] font-semibold text-black/60">
                  {eventPeriod(event)} ·{' '}
                  <span className={event.isFree ? 'text-[#2468E0]' : ''}>
                    {event.isFree ? '무료' : '유료'}
                  </span>
                </p>
                <button
                  onClick={() => setOpenEventId(openEventId === event.id ? null : event.id)}
                  aria-expanded={openEventId === event.id}
                  className="mt-3 h-10 w-full rounded-lg bg-[#eaf2fe] text-[14px] font-extrabold text-[#2468E0]"
                >
                  {openEventId === event.id ? '접기' : '상세보기'}
                </button>
                {openEventId === event.id && <EventDetailBody event={event} />}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-1 text-[11px] font-medium leading-relaxed text-black/60">
          <p>데이터 기준일 {place.collectedAt}</p>
          <p>데이터 출처 {dataSource(place)}</p>
          {place.sample && <p>샘플 데이터예요.</p>}
        </div>
      </div>
    </div>
  )
}
function EventDetailBody({ event }) {
  return (
    <div className="mt-3 border-t border-black/[0.07] pt-1">
      <DetailRow label="기간">
        {event.start === event.end ? event.start : `${event.start} ~ ${event.end}`}
      </DetailRow>
      {event.showtime && <DetailRow label="시간">{event.showtime}</DetailRow>}
      <DetailRow label="요금">{event.price}</DetailRow>
      {event.rating && <DetailRow label="관람등급">{event.rating}</DetailRow>}
      {event.runtime && <DetailRow label="러닝타임">{event.runtime}</DetailRow>}
      {event.enterprise && <DetailRow label="주최·기획">{event.enterprise}</DetailRow>}
      {event.casting && <DetailRow label="출연">{event.casting}</DetailRow>}
      {event.crew && <DetailRow label="제작진">{event.crew}</DetailRow>}
      <a
        href={event.detailUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 grid h-11 place-items-center rounded-lg bg-[#2F7BF5] text-[14px] font-black text-white"
      >
        공식 상세 안내 · 예매
      </a>
      <p className="mt-2 text-[11px] font-medium text-black/60">
        데이터 기준일 {event.collectedAt}
      </p>
    </div>
  )
}
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
function daysOfLabel(label) {
  const range = label.match(/([월화수목금토일])\s*~\s*([월화수목금토일])/)
  if (range) {
    const from = DAY_NAMES.indexOf(range[1])
    const to = DAY_NAMES.indexOf(range[2])
    const out = []
    for (let d = from; ; d = (d + 1) % 7) {
      out.push(d)
      if (d === to) break
    }
    return out
  }
  if (/평일/.test(label)) return [1, 2, 3, 4, 5]
  if (/주말/.test(label)) return [0, 6]
  if (/연중무휴|매일/.test(label)) return [0, 1, 2, 3, 4, 5, 6]
  const singles = [...label.replace(/공휴일/g, '').matchAll(/[월화수목금토일]/g)].map((m) =>
    DAY_NAMES.indexOf(m[0])
  )
  return singles.length ? singles : null
}
function isClosedToday(closed, now) {
  if (!closed) return false
  const day = now.getDay()
  const week = Math.ceil(now.getDate() / 7)
  const ordinal = [...closed.matchAll(/([첫둘셋넷])째주\s*([월화수목금토일])/g)]
  if (ordinal.length)
    return ordinal.some(
      (m) => DAY_NAMES.indexOf(m[2]) === day && ['첫', '둘', '셋', '넷'].indexOf(m[1]) + 1 === week
    )
  const weekly = closed.match(/([월화수목금토일])\((\d(?:\+\d)*)주\)/)
  if (weekly && DAY_NAMES.indexOf(weekly[1]) === day)
    return weekly[2].split('+').map(Number).includes(week)
  return closed
    .split(/[+,\s]/)
    .some((t) => /^[월화수목금토일](요일)?$/.test(t) && DAY_NAMES.indexOf(t[0]) === day)
}
function isOpenNow(place, now = new Date()) {
  const text = place.openHours
  if (!text || isClosedToday(place.closedDays, now)) return false
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const ranges = [...text.matchAll(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/g)]
  if (!ranges.length) return false
  let sawLabel = false
  let open = false
  let cursor = 0
  for (const m of ranges) {
    const label = text.slice(cursor, m.index)
    cursor = (m.index ?? 0) + m[0].length
    const days = daysOfLabel(label) ?? (sawLabel ? null : [0, 1, 2, 3, 4, 5, 6])
    if (label.trim()) sawLabel = true
    if (!days || !days.includes(day)) continue
    const start = +m[1] * 60 + +m[2]
    const end = +m[3] * 60 + +m[4]
    if (end === start) continue
    if (mins >= start && mins < end) open = true
  }
  return open
}
function placeMatchesTerm(place, term) {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return `${place.name} ${place.address} ${place.district} ${place.placeType} ${catOf(place.category).label}`
    .toLowerCase()
    .includes(q)
}
function matchesFee(place, fee) {
  if (fee === 'all') return true
  const t = getFeeType(place)
  return fee === 'free' ? t === 'free' : t === 'paid' || t === 'per_program'
}
function toggleIn(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}
function FilterGroup({ title, children }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[13px] font-black text-black/60">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}
function FilterChip({ active, onClick, children }) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-extrabold transition ${
        active
          ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
          : 'border-black/10 bg-white text-black/70'
      }`}
    >
      {children}
    </button>
  )
}
function MapFilterSheet(props) {
  const cats = CATEGORIES.filter((c) => places.some((p) => p.category === c.code))
  const districtList = Array.from(new Set(places.map((p) => p.district)))
  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end bg-black/40"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-label="지도 필터"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] flex-col rounded-t-3xl bg-white"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-[17px] font-black">필터</h2>
          <button
            onClick={props.onClose}
            aria-label="닫기"
            className="grid size-9 place-items-center text-black/60"
          >
            <Glyph name="close" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 pt-2">
          <FilterGroup title="분류">
            <FilterChip active={props.category === 'all'} onClick={() => props.onCategory('all')}>
              전체
            </FilterChip>
            {cats.map((c) => (
              <FilterChip
                key={c.code}
                active={props.category === c.code}
                onClick={() => props.onCategory(c.code)}
              >
                <CategoryBadge kind={c.code} color={c.color} className="-my-1 size-8" />
                {c.label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="요금">
            {[
              ['all', '전체'],
              ['free', '무료'],
              ['paid', '유료'],
            ].map(([v, label]) => (
              <FilterChip key={v} active={props.fee === v} onClick={() => props.onFee(v)}>
                {label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="거리 반경">
            <FilterChip active={props.radius === null} onClick={() => props.onRadius(null)}>
              제한 없음
            </FilterChip>
            {[500, 1000, 2000, 3000].map((m) => (
              <FilterChip key={m} active={props.radius === m} onClick={() => props.onRadius(m)}>
                {m < 1000 ? `${m}m` : `${m / 1000}km`} 이내
              </FilterChip>
            ))}
            {!props.hasLocation && (
              <p className="w-full text-[12px] font-medium text-black/60">
                현재 위치를 알 수 없으면 거리 반경은 적용되지 않아요.
              </p>
            )}
          </FilterGroup>
          <FilterGroup title="지역">
            {districtList.map((d) => (
              <FilterChip
                key={d}
                active={props.districts.includes(d)}
                onClick={() => props.onDistricts(toggleIn(props.districts, d))}
              >
                {d}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="기타">
            <FilterChip active={props.openNow} onClick={() => props.onOpenNow(!props.openNow)}>
              운영 중
            </FilterChip>
            <FilterChip
              active={props.reservableOnly}
              onClick={() => props.onReservableOnly(!props.reservableOnly)}
            >
              예약 가능
            </FilterChip>
          </FilterGroup>
        </div>
        <div className="flex gap-2 border-t border-black/[0.06] px-5 py-3">
          <button
            onClick={props.onReset}
            className="h-12 rounded-2xl bg-[#f0f1f5] px-5 text-[14px] font-extrabold text-black/60"
          >
            초기화
          </button>
          <button
            onClick={props.onClose}
            className="h-12 flex-1 rounded-2xl bg-[#2F7BF5] text-[14px] font-extrabold text-white"
          >
            장소 {props.count}곳 보기
          </button>
        </div>
      </div>
    </div>
  )
}
function MapHeader({
  onBell,
  onPick,
  filterCount,
  onFilter,
  allowedIds,
  searchTerm,
  onSearchTerm,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const q = query.trim().toLowerCase()
  const hits = useMemo(() => {
    if (!q) return []
    const out = []
    for (const place of places) {
      if (!allowedIds.has(place.id)) continue
      if (
        `${place.name} ${place.address} ${place.district} ${place.placeType} ${catOf(place.category).label}`
          .toLowerCase()
          .includes(q)
      )
        out.push({
          key: place.id,
          place,
          title: place.name,
          sub: `${catOf(place.category).label} · ${place.district}`,
        })
    }
    return out.slice(0, 20)
  }, [q, allowedIds])
  function pick(hit) {
    onPick(hit.place)
    setOpen(false)
    setResultsOpen(false)
    if (!searchTerm) setQuery('')
  }
  function submit() {
    if (hits.length === 1) {
      onSearchTerm('')
      pick(hits[0])
      setQuery('')
    } else if (hits.length > 1) {
      onSearchTerm(query.trim())
      setOpen(false)
      setResultsOpen(true)
    }
  }
  return (
    <div className="relative flex h-[68px] items-center gap-2.5 px-5">
      <h1 className="shrink-0 text-[23px] font-black tracking-[-0.7px]">지도</h1>
      <div className="relative min-w-0 flex-1">
        <button
          onClick={onFilter}
          aria-label="필터"
          className="absolute left-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-black/60"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h3M13 6h7M4 12h9M19 12h1M4 18h1M11 18h9" />
            <circle cx="10" cy="6" r="2.2" />
            <circle cx="16" cy="12" r="2.2" />
            <circle cx="8" cy="18" r="2.2" />
          </svg>
          {filterCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#2F7BF5] px-1 text-[10px] font-black leading-4 text-white">
              {filterCount}
            </span>
          )}
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!e.target.value.trim()) onSearchTerm('')
            setOpen(true)
            setResultsOpen(false)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="장소 검색"
          aria-label="장소 검색"
          className="h-11 w-full rounded-full bg-white pl-11 pr-4 text-[14px] font-semibold outline-none placeholder:text-black/60 focus:ring-2 focus:ring-[#2F7BF5]"
        />
        {open && q && (
          <>
            <button
              aria-label="검색 결과 닫기"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <ul className="absolute inset-x-0 top-12 z-50 max-h-[50vh] overflow-y-auto rounded-2xl bg-white py-1 shadow-[0_8px_28px_rgba(23,25,35,0.18)]">
              {hits.length === 0 && (
                <li className="px-4 py-3 text-[13px] font-medium text-black/60">
                  검색 결과가 없어요
                </li>
              )}
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    onClick={() => pick(hit)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
                  >
                    <CategoryBadge
                      kind={hit.place.category}
                      color={catOf(hit.place.category).color}
                      className="size-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{hit.title}</span>
                      <span className="block truncate text-[12px] font-medium text-black/60">
                        {hit.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {resultsOpen && q && hits.length > 1 && (
        <div className="absolute inset-x-0 top-full z-50 h-[calc(100dvh-68px)] bg-black/30">
          <div className="flex max-h-[75%] flex-col rounded-b-3xl bg-white shadow-[0_8px_28px_rgba(23,25,35,0.18)]">
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-[15px] font-black">
                &lsquo;{query.trim()}&rsquo; 검색 결과 {hits.length}건
              </h2>
              <button
                onClick={() => setResultsOpen(false)}
                aria-label="검색 결과 닫기"
                className="grid size-9 place-items-center text-black/60"
              >
                <Glyph name="close" className="size-5" />
              </button>
            </div>
            <ul className="overflow-y-auto pb-2">
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    onClick={() => pick(hit)}
                    className="flex w-full items-center gap-3 border-b border-black/[0.05] px-5 py-3 text-left"
                  >
                    <CategoryBadge
                      kind={hit.place.category}
                      color={catOf(hit.place.category).color}
                      className="size-11 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold">{hit.title}</span>
                      <span className="block truncate text-[12px] font-medium text-black/60">
                        {hit.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button
            aria-label="검색 결과 닫기"
            className="block h-full w-full cursor-default"
            onClick={() => setResultsOpen(false)}
          />
        </div>
      )}
      <NotificationBell onClick={onBell} />
    </div>
  )
}
function ChipBar({ category, onCategory, fee, onFee }) {
  const items = [
    { code: 'all', label: '전체', color: '' },
    ...CATEGORIES.filter((c) => places.some((p) => p.category === c.code)),
  ]
  const chip =
    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-extrabold shadow-[0_2px_8px_rgba(23,25,35,0.14)] transition'
  return (
    <DragScroll
      role="group"
      ariaLabel="분류 필터"
      className="no-scrollbar absolute inset-x-0 top-0 z-40 flex items-center gap-1.5 overflow-x-auto px-2.5"
      style={{ height: BAR_HEIGHT }}
    >
      {items.map((item) => {
        const active = category === item.code
        return (
          <Fragment key={item.code}>
            <button
              aria-pressed={active}
              onClick={() => onCategory(item.code)}
              className={`${chip} ${active ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/70'}`}
            >
              {item.color && (
                <CategoryBadge
                  kind={item.code}
                  color={item.color}
                  className="-my-1.5 size-8 shrink-0"
                />
              )}
              {item.label}
            </button>
            {item.code === 'all' && (
              <button
                aria-pressed={fee !== 'all'}
                onClick={() => onFee(fee === 'all' ? 'free' : fee === 'free' ? 'paid' : 'all')}
                className={`${chip} ${fee !== 'all' ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/70'}`}
              >
                {fee === 'paid' ? '유료' : '무료'}
              </button>
            )}
          </Fragment>
        )
      })}
    </DragScroll>
  )
}
const LOCATION_NOTICE = {
  denied: {
    title: '위치 권한이 꺼져 있어요',
    body: '켜면 가까운 순으로 볼 수 있어요.',
    action: '설정 열기',
  },
  failed: {
    title: '현재 위치를 가져오지 못했어요',
    body: '거주 구 중심, 이름순으로 보여드려요.',
    action: '다시 시도',
  },
  outside: {
    title: '서비스 지역(사하구·부산진구) 밖이에요',
    body: '거리 정보 없이 거주 구 중심으로 보여드려요.',
    action: '',
  },
}
export default function MapScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const {data:mapProfile}=useQuery({queryKey:['map-profile',user?.id],queryFn:()=>personalApi('/map-profile'),enabled:!!user})
  const profile={region:busanRegions[mapProfile?.region_code]||''}
  const homeDistrict = profile.region.replace(/^부산광역시\s*/, '')||null
  const loggedIn = !!user
  const [loc, setLoc] = useState(() => {
    const q = params.get('location')
    if (q && LOCATION_STATES.includes(q)) return q
    return homeDistrict === '사하구' ? 'ok-saha' : homeDistrict==='부산진구'?'ok-busanjin':'denied'
  })
  const [noticeHidden, setNoticeHidden] = useState(false)
  const [category, setCategory] = useState('all')
  const [fee, setFee] = useState('all')
  const [openNow, setOpenNow] = useState(false)
  const [radius, setRadius] = useState(null)
  const [districts, setDistricts] = useState([])
  const [reservableOnly, setReservableOnly] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [viewport, setViewport] = useState(() => {
    if(!params.has('location'))return districtView(homeDistrict)
    const start = USER_POSITIONS[loc]
    return start
      ? { lat: start.lat, lng: start.lng, level: START_LEVEL }
      : districtView(homeDistrict)
  })
  const [loadError, setLoadError] = useState(params.get('load') === 'error')
  const [selectedId, setSelectedId] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [sheet, setSheet] = useState('mid')
  const [saved, setSaved] = useState([])
  const [notice, setNotice] = useState('')
  const [regionHeight, setRegionHeight] = useState(560)
  useEffect(() => {
    // Apply the asynchronously loaded home region on the next map render frame.
    if(params.has('location'))return
    const frame=requestAnimationFrame(()=>{
      setViewport(districtView(homeDistrict))
      setLoc(homeDistrict==='사하구'?'ok-saha':homeDistrict==='부산진구'?'ok-busanjin':'denied')
    })
    return()=>cancelAnimationFrame(frame)
  }, [homeDistrict, user?.id, params])
  const regionRef = useRef(null)
  const listRef = useRef(null)
  const cardRefs = useRef({})
  const handleStart = useRef(null)
  const userPos = USER_POSITIONS[loc] ?? null
  const myLocation = userPos
  const sortOrigin = userPos
  const [searchTerm, setSearchTerm] = useState('')
  const searchablePlaces = useMemo(() => {
    if (loadError) return []
    return places.filter(
      (place) =>
        (category === 'all' || place.category === category) &&
        matchesFee(place, fee) &&
        (!openNow || isOpenNow(place)) &&
        (districts.length === 0 || districts.includes(place.district)) &&
        (!reservableOnly || !!place.reservationUrl) &&
        (!savedOnly || saved.includes(place.id))
    )
  }, [loadError, category, fee, openNow, districts, reservableOnly, savedOnly, saved])
  const visiblePlaces = useMemo(() => {
    const list = searchablePlaces.filter((place) => placeMatchesTerm(place, searchTerm))
    const withDistance = list
      .map((place) => ({
        place,
        distance: sortOrigin ? distanceMeters(sortOrigin, place) : null,
      }))
      .filter(({ distance }) => radius === null || distance === null || distance <= radius)
    withDistance.sort((a, b) =>
      a.distance !== null && b.distance !== null
        ? a.distance - b.distance
        : a.place.name.localeCompare(b.place.name, 'ko')
    )
    return withDistance
  }, [searchablePlaces, searchTerm, radius, sortOrigin])
  const allowedIds = useMemo(
    () => new Set(searchablePlaces.map((place) => place.id)),
    [searchablePlaces]
  )
  const heights = sheetHeights(regionHeight)
  const selectedPlace = selectedId
    ? (places.find((place) => place.id === selectedId) ?? null)
    : null
  const cardMode = selectedPlace !== null
  const sheetHeight = cardMode ? CARD_HEIGHT : heights[sheet]
  const bottomInset = cardMode ? CARD_HEIGHT : Math.min(heights[sheet], heights.mid)
  const detailPlace = detailId ? (places.find((place) => place.id === detailId) ?? null) : null
  useLayoutEffect(() => {
    const el = regionRef.current
    if (!el) return
    const measure = () => setRegionHeight(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (loc !== 'outside') return
    setNoticeHidden(false)
    const timer = window.setTimeout(() => setNoticeHidden(true), 3000)
    return () => window.clearTimeout(timer)
  }, [loc])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!selectedId || sheet === 'collapsed') return
    const timer = window.setTimeout(() => {
      const list = listRef.current
      const card = cardRefs.current[selectedId]
      if (!list || !card) return
      const top = card.offsetTop - 8
      const bottom = card.offsetTop + card.offsetHeight + 16
      if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' })
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' })
    }, 240)
    return () => window.clearTimeout(timer)
  }, [selectedId, sheet])
  function focusOn(lat, lng) {
    setViewport((current) => ({
      lat,
      lng,
      level: Math.max(current.level, START_LEVEL + 1),
    }))
  }
  function selectFromMarker(id) {
    setSelectedId(id)
    if (!id) return
    const place = places.find((item) => item.id === id)
    if (place) focusOn(place.lat, place.lng)
  }
  function pickFromSearch(place) {
    selectFromCard(place)
  }
  function selectFromCard(place) {
    setSelectedId(place.id)
    focusOn(place.lat, place.lng)
  }
  function toggleSaved(id) {
    if (!loggedIn) {
      setNotice('찜은 로그인 후 사용할 수 있어요')
      return
    }
    const wasSaved = saved.includes(id)
    setSaved((current) => (wasSaved ? current.filter((item) => item !== id) : [...current, id]))
    setNotice(wasSaved ? '찜을 해제했어요' : '찜했어요')
  }
  function toggleSavedOnly() {
    if (!loggedIn) {
      setNotice('찜은 로그인 후 사용할 수 있어요')
      return
    }
    setSavedOnly((value) => !value)
    setSelectedId(null)
    listRef.current?.scrollTo({ top: 0 })
  }
  function changeFee(next) {
    setFee(next)
    if (selectedPlace && !matchesFee(selectedPlace, next)) setSelectedId(null)
    listRef.current?.scrollTo({ top: 0 })
  }
  function zoom(delta) {
    setViewport((current) => ({
      ...current,
      level: Math.min(MAP_MAX_LEVEL, Math.max(MAP_MIN_LEVEL, current.level + delta)),
    }))
  }
  function moveSheet(direction) {
    const index = STOPS.indexOf(sheet)
    setSheet(STOPS[Math.min(STOPS.length - 1, Math.max(0, index + direction))])
  }
  function onHandleDown(event) {
    handleStart.current = { y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onHandleUp(event) {
    const start = handleStart.current
    handleStart.current = null
    if (!start || start.id !== event.pointerId) return
    const delta = event.clientY - start.y
    if (delta <= -24) moveSheet(1)
    else if (delta >= 24) moveSheet(-1)
    else if (Math.abs(delta) < 8)
      setSheet(sheet === 'collapsed' ? 'mid' : sheet === 'mid' ? 'full' : 'mid')
  }
  function onHandleKey(event) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSheet(1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSheet(-1)
    }
  }
  function onNoticeAction() {
    if (loc === 'denied') {
      setLoc(homeDistrict === '사하구' ? 'ok-saha' : 'ok-busanjin')
      setNotice('위치 권한을 허용했어요.')
    } else if (loc === 'failed') {
      setLoc(homeDistrict === '사하구' ? 'ok-saha' : 'ok-busanjin')
      setNotice('현재 위치를 찾았어요.')
    } else {
      setNoticeHidden(true)
    }
  }
  function locateMe() {
    if (!myLocation) {
      if (loc === 'outside') {
        setNotice('서비스 지역(사하구·부산진구) 밖이에요')
        return
      }
      const next = homeDistrict === '사하구' ? 'ok-saha' : 'ok-busanjin'
      const pos = USER_POSITIONS[next]
      setLoc(next)
      setNotice(loc === 'denied' ? '위치 권한을 허용했어요.' : '현재 위치를 찾았어요.')
      if (pos) {
        setSelectedId(null)
        focusOn(pos.lat, pos.lng)
      }
      return
    }
    setSelectedId(null)
    focusOn(myLocation.lat, myLocation.lng)
  }
  const controlsHidden = !cardMode && sheet === 'full'
  const savedCount = saved.length
  function changeCategory(code) {
    setCategory(code)
    if (selectedPlace && code !== 'all' && selectedPlace.category !== code) setSelectedId(null)
    listRef.current?.scrollTo({ top: 0 })
  }
  function resetFilter() {
    setCategory('all')
    setFee('all')
    setOpenNow(false)
    setRadius(null)
    setDistricts([])
    setReservableOnly(false)
    setSavedOnly(false)
  }
  const locNotice = LOCATION_NOTICE[loc]
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-[#f7f8fb] text-[#171923] shadow-[0_0_40px_rgba(23,25,35,0.08)]">
        <header className="relative z-[60] shrink-0 border-b border-black/[0.05] bg-[#eaf2ff]">
          <MapHeader
            onBell={() => navigate('/notifications')}
            onPick={pickFromSearch}
            filterCount={
              (category !== 'all' ? 1 : 0) +
              (fee !== 'all' ? 1 : 0) +
              (openNow ? 1 : 0) +
              (radius !== null ? 1 : 0) +
              districts.length +
              (reservableOnly ? 1 : 0)
            }
            onFilter={() => setFilterOpen(true)}
            allowedIds={allowedIds}
            searchTerm={searchTerm}
            onSearchTerm={setSearchTerm}
          />
        </header>

        <main ref={regionRef} className="relative min-h-0 flex-1 overflow-hidden">
          <PlaceMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={visiblePlaces.map(({ place }) => ({
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              label: place.name,
              color: catOf(place.category).color,
              kind: place.category,
              saved: saved.includes(place.id),
            }))}
            selectedId={selectedId}
            onSelectMarker={selectFromMarker}
            myLocation={myLocation}
            bottomInset={bottomInset}
            topInset={BAR_HEIGHT}
          />

          {!loadError && (
            <ChipBar category={category} onCategory={changeCategory} fee={fee} onFee={changeFee} />
          )}

          {locNotice && !noticeHidden && (
            <div
              className="absolute inset-x-2.5 z-20 flex flex-col items-start gap-2"
              style={{ top: BAR_HEIGHT }}
            >
              <section
                className="flex w-full items-center gap-2.5 rounded-xl bg-white py-2.5 pl-3.5 pr-1.5 shadow-[0_6px_20px_rgba(23,25,35,0.14)]"
                aria-label="위치 안내"
              >
                <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-black/75">
                  {locNotice.title}
                  {loc === 'denied' && '. 켜면 가까운 순으로 볼 수 있어요'}
                </p>
                {locNotice.action && (
                  <button
                    onClick={onNoticeAction}
                    className="shrink-0 rounded-lg border border-[#2F7BF5] px-2.5 py-1.5 text-xs font-extrabold text-[#2468E0]"
                  >
                    {locNotice.action}
                  </button>
                )}
                <button
                  onClick={() => setNoticeHidden(true)}
                  aria-label="안내 닫기"
                  className="grid size-10 shrink-0 place-items-center text-black/60"
                >
                  <Glyph name="close" className="size-4" />
                </button>
              </section>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#171923]/90 px-4 py-2 text-xs font-bold text-white shadow-lg"
              style={{ bottom: sheetHeight + 16 }}
            >
              {notice}
            </div>
          )}

          <div
            aria-hidden={controlsHidden}
            className={`absolute right-3 z-20 flex flex-col gap-2 transition-[opacity,bottom] duration-200 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            style={{ bottom: sheetHeight + 12 }}
          >
            <button
              onClick={toggleSavedOnly}
              aria-pressed={savedOnly}
              aria-label={savedOnly ? '찜한 장소만 보기 해제' : '찜한 장소만 보기'}
              className={`relative grid size-11 place-items-center rounded-full shadow-[0_2px_10px_rgba(23,25,35,0.2)] transition ${
                savedOnly ? 'bg-[#e5445f] text-white' : 'bg-white text-[#e5445f]'
              }`}
            >
              <Icon name="heart" className={`size-5 ${savedOnly ? 'fill-current' : ''}`} />
              {savedCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-[1.5px] border-[#e5445f] bg-white px-1 text-[11px] font-extrabold leading-none text-[#e5445f]">
                  {savedCount}
                </span>
              )}
            </button>
            {[
              {
                label: '지도 확대',
                icon: 'plus',
                onClick: () => zoom(1),
                disabled: viewport.level >= MAP_MAX_LEVEL,
              },
              {
                label: '지도 축소',
                icon: 'minus',
                onClick: () => zoom(-1),
                disabled: viewport.level <= MAP_MIN_LEVEL,
              },
              {
                label: myLocation ? '내 위치로 이동' : '위치 권한 다시 요청',
                icon: myLocation ? 'locate' : 'locateOff',
                onClick: locateMe,
                disabled: false,
              },
            ].map((button) => (
              <button
                key={button.label}
                onClick={button.onClick}
                disabled={button.disabled}
                aria-label={button.label}
                className="grid size-11 place-items-center rounded-full bg-white text-black/70 shadow-[0_2px_10px_rgba(23,25,35,0.2)] disabled:text-black/20"
              >
                <Glyph name={button.icon} className="size-5" />
              </button>
            ))}
          </div>

          <section
            aria-label="장소 목록"
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_-8px_32px_rgba(23,25,35,0.16)] transition-[height] duration-200 ease-out"
            style={{ height: sheetHeight }}
          >
            {selectedPlace ? (
              <>
                <span className="mx-auto mb-3 mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-black/15" />
                <PlaceSummary
                  place={selectedPlace}
                  distance={sortOrigin ? distanceMeters(sortOrigin, selectedPlace) : null}
                  saved={saved.includes(selectedPlace.id)}
                  onToggleSaved={() => toggleSaved(selectedPlace.id)}
                  onOpen={() => setDetailId(selectedPlace.id)}
                  onClose={() => setSelectedId(null)}
                />
              </>
            ) : (
              <>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="장소 목록 높이 조절"
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={2}
                  aria-valuenow={STOPS.indexOf(sheet)}
                  aria-valuetext={
                    sheet === 'collapsed' ? '접힘' : sheet === 'mid' ? '중간' : '전체'
                  }
                  onPointerDown={onHandleDown}
                  onPointerUp={onHandleUp}
                  onPointerCancel={() => (handleStart.current = null)}
                  onKeyDown={onHandleKey}
                  className="shrink-0 cursor-grab touch-none select-none px-5 pb-3 pt-2.5"
                >
                  <span className="mx-auto block h-1 w-10 rounded-full bg-black/15" />
                  <div className="mt-3.5 flex items-center justify-between">
                    <h2 className="text-[15px] font-black tracking-[-0.03em]">
                      {loadError
                        ? '주변 장소'
                        : `${savedOnly ? '찜한 장소' : sortOrigin ? '주변 장소' : '장소'} ${visiblePlaces.length}곳`}
                    </h2>
                    {!loadError && (
                      <span className="text-[12px] font-bold text-black/60">
                        {sortOrigin ? '거리순' : '이름순'}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  ref={listRef}
                  className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-black/[0.06]"
                >
                  {loadError && (
                    <div className="px-6 py-10 text-center">
                      <p className="text-[14px] font-black tracking-[-0.03em]">
                        장소를 불러오지 못했어요
                      </p>
                      <button
                        onClick={() => setLoadError(false)}
                        className="mt-4 rounded-lg border border-[#2F7BF5] px-4 py-2 text-[13px] font-extrabold text-[#2468E0]"
                      >
                        다시 시도
                      </button>
                    </div>
                  )}
                  {!loadError && visiblePlaces.length === 0 && (
                    <div className="px-6 py-10 text-center">
                      <p className="text-[14px] font-black tracking-[-0.03em]">
                        {savedOnly && saved.length === 0
                          ? '찜한 장소가 없어요'
                          : '조건에 맞는 장소가 없어요'}
                      </p>
                      <button
                        onClick={resetFilter}
                        className="mt-4 rounded-lg border border-[#2F7BF5] px-4 py-2 text-[13px] font-extrabold text-[#2468E0]"
                      >
                        {savedOnly && saved.length === 0 ? '전체 보기' : '필터 초기화'}
                      </button>
                    </div>
                  )}
                  {visiblePlaces.map(({ place, distance }) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      distance={distance}
                      selected={place.id === selectedId}
                      saved={saved.includes(place.id)}
                      onSelect={() => selectFromCard(place)}
                      onToggleSaved={() => toggleSaved(place.id)}
                      cardRef={(el) => (cardRefs.current[place.id] = el)}
                    />
                  ))}
                  <p className="px-5 pb-5 pt-3 text-center text-[10px] font-medium text-black/25">
                    대부분 샘플 장소 데이터예요. 찜은 이 화면을 나가면 초기화돼요.
                  </p>
                </div>
              </>
            )}
          </section>

          {detailPlace && (
            <PlaceDetail
              place={detailPlace}
              distance={sortOrigin ? distanceMeters(sortOrigin, detailPlace) : null}
              saved={saved.includes(detailPlace.id)}
              onToggleSaved={() => toggleSaved(detailPlace.id)}
              onClose={() => setDetailId(null)}
            />
          )}
        </main>

        <div
          className="h-[calc(57px+max(10px,env(safe-area-inset-bottom)))] shrink-0"
          aria-hidden="true"
        />
        {filterOpen && (
          <MapFilterSheet
            category={category}
            onCategory={changeCategory}
            fee={fee}
            onFee={setFee}
            openNow={openNow}
            onOpenNow={setOpenNow}
            radius={radius}
            onRadius={setRadius}
            hasLocation={!!sortOrigin}
            districts={districts}
            onDistricts={setDistricts}
            reservableOnly={reservableOnly}
            onReservableOnly={setReservableOnly}
            count={visiblePlaces.length}
            onReset={resetFilter}
            onClose={() => setFilterOpen(false)}
          />
        )}
        <BottomNav active="지도" />
      </div>
    </div>
  )
}
