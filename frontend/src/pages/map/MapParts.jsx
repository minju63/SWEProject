// 지도 탭 화면 조각 (Figma MapScreen.tsx 에서 옮김, 데이터는 API)
import { Fragment, memo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPlace } from '../../api/places';
import { CategoryBadge, Glyph } from './mapIcons.jsx';
import { dataSource, eventPeriod, formatDistance, kakaoLink, toEvent } from './mapUtils.js';

// 마우스로 끌어서 가로 스크롤 (터치는 기본 스크롤)
export function DragScroll({ className = '', children, style, role, ariaLabel }) {
  const ref = useRef(null);
  const st = useRef({ down: false, x: 0, left: 0, moved: false });
  return (
    <div
      ref={ref}
      style={style}
      role={role}
      aria-label={ariaLabel}
      className={`${className} cursor-grab select-none active:cursor-grabbing`}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        st.current = { down: true, x: e.clientX, left: ref.current.scrollLeft, moved: false };
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s.down || !ref.current) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 5) s.moved = true;
        ref.current.scrollLeft = s.left - dx;
      }}
      onPointerUp={() => (st.current.down = false)}
      onPointerLeave={() => (st.current.down = false)}
      onClickCapture={(e) => {
        if (st.current.moved) {
          e.stopPropagation();
          e.preventDefault();
          st.current.moved = false;
        }
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

export function EventChip({ status }) {
  if (!status) return null;
  return (
    <span
      className={`text-[12px] font-extrabold ${status === '진행 중' ? 'text-[#a0672a]' : 'text-[#2F7BF5]'}`}
    >
      {status}
    </span>
  );
}

export function CategoryTag({ place }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-extrabold"
      style={{
        color: place.color,
        borderColor: `color-mix(in srgb, ${place.color} 45%, white)`,
        backgroundColor: `color-mix(in srgb, ${place.color} 8%, white)`,
      }}
    >
      {place.categoryName}
    </span>
  );
}

// 좌표 검증 상태가 review 인 장소 (2026-11-13 결정: 숨기지 않고 표시)
export function ReviewTag({ place }) {
  if (place.coordStatus !== 'review') return null;
  return (
    <span className="inline-flex items-center rounded-md bg-[#fff4e5] px-2 py-0.5 text-[11px] font-extrabold text-[#b26a00]">
      위치 확인 필요
    </span>
  );
}

export function HeartButton({ place, saved, onToggle, className = 'size-10' }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? `${place.name} 찜 해제` : `${place.name} 찜하기`}
      className={`grid shrink-0 place-items-center rounded-full transition active:scale-90 ${className} ${
        saved ? 'text-[#e5445f]' : 'text-black/40'
      }`}
    >
      <Glyph name="heart" className={`size-[22px] ${saved ? 'fill-current' : ''}`} />
    </button>
  );
}

// 목록 한 줄. 지도를 움직일 때마다 112줄을 다시 그리지 않도록 값이 바뀐 줄만 다시 그린다
export const PlaceRow = memo(function PlaceRow({
  place,
  distance,
  selected,
  saved,
  onSelect,
  onToggleSaved,
  registerCard,
}) {
  return (
    <div
      ref={(el) => registerCard(place.id, el)}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(place)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(place);
        }
      }}
      className={`flex cursor-pointer items-center gap-3 border-b border-black/[0.06] px-5 py-3.5 transition ${
        selected ? 'bg-[#f1f3fb]' : 'bg-white'
      }`}
    >
      <CategoryBadge kind={place.category} color={place.color} className="size-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-black tracking-[-0.03em]">{place.name}</h3>
        <p className="mt-0.5 truncate text-[12px] font-medium text-black/50">
          {place.categoryName}
          {place.address && ` · ${place.address}`}
          {place.liveEventCount > 0 && ` · 행사 ${place.liveEventCount}`}
        </p>
      </div>
      {distance !== null && (
        <span className="shrink-0 text-[13px] font-extrabold text-[#a0672a]">
          {formatDistance(distance)}
        </span>
      )}
      <HeartButton place={place} saved={saved} onToggle={() => onToggleSaved(place.id)} />
    </div>
  );
});

export function PlaceSummary({ place, distance, saved, onToggleSaved, onOpen, onClose }) {
  return (
    <div className="px-5 pb-5 pt-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryTag place={place} />
            <EventChip status={place.nextEventStatus} />
            <ReviewTag place={place} />
          </div>
          <h3 className="mt-2 text-[18px] font-black tracking-[-0.03em]">{place.name}</h3>
        </div>
        <HeartButton place={place} saved={saved} onToggle={onToggleSaved} />
        <button
          type="button"
          onClick={onClose}
          aria-label="선택 닫기"
          className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-black/50"
        >
          <Glyph name="close" className="size-5" />
        </button>
      </div>
      {place.address && (
        <p className="mt-1.5 truncate text-[13px] font-medium text-black/55">{place.address}</p>
      )}
      {distance !== null && (
        <p className="mt-2 text-[14px] font-extrabold text-[#a0672a]">{formatDistance(distance)}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 rounded-xl bg-[#6678c8] py-3 text-[14px] font-black text-white transition active:scale-[0.98]"
        >
          상세보기
        </button>
        <a
          href={kakaoLink(place)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-xl border border-[#6678c8] bg-white py-3 text-center text-[14px] font-black text-[#6678c8] no-underline transition active:scale-[0.98]"
        >
          길찾기
        </a>
      </div>
    </div>
  );
}

export function DetailRow({ label, children }) {
  return (
    <div className="flex gap-4 border-t border-black/[0.07] py-3.5 text-[14px]">
      <span className="w-14 shrink-0 font-medium text-black/45">{label}</span>
      <div className="min-w-0 flex-1 break-words font-semibold text-black/80">{children}</div>
    </div>
  );
}

const LINK = 'text-[#6678c8] underline underline-offset-2';

export function PlaceDetail({ place, distance, saved, onToggleSaved, onClose }) {
  const detail = useQuery({ queryKey: ['place', place.id], queryFn: () => fetchPlace(place.id) });
  const events = (detail.data?.events ?? []).map(toEvent);
  const [openEventId, setOpenEventId] = useState(null);
  return (
    <div
      role="dialog"
      aria-label={`${place.name} 상세`}
      className="absolute inset-0 z-40 flex flex-col bg-white"
    >
      <div className="flex h-[56px] shrink-0 items-center gap-1 border-b border-black/[0.07] bg-white px-3">
        <button
          type="button"
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
        {place.imageUrl && (
          <figure className="-mx-5 -mt-5 mb-5">
            <img
              src={place.imageUrl}
              alt={`${place.name} 사진`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="block aspect-[16/9] w-full bg-[#eceef4] object-cover"
            />
          </figure>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-black/50">
          <CategoryTag place={place} />
          <span>{place.placeType}</span>
          <ReviewTag place={place} />
          {distance !== null && (
            <span className="font-extrabold text-[#a0672a]">{formatDistance(distance)}</span>
          )}
        </div>
        <h3 className="mt-3 text-[26px] font-black leading-tight tracking-[-0.04em]">
          {place.name}
        </h3>
        {place.description && (
          <p className="mt-2 text-[14px] font-medium leading-relaxed text-black/60">
            {place.description}
          </p>
        )}
        <a
          href={kakaoLink(place)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg bg-[#6678c8] px-6 py-3 text-[14px] font-black text-white no-underline"
        >
          길찾기
        </a>

        <section className="mt-5 border-b border-black/[0.07]">
          {place.address && <DetailRow label="주소">{place.address}</DetailRow>}
          {place.tel && (
            <DetailRow label="전화">
              <a href={`tel:${place.tel}`} className={LINK}>
                {place.tel}
              </a>
            </DetailRow>
          )}
          {place.homepage && (
            <DetailRow label="홈페이지">
              <a href={place.homepage} target="_blank" rel="noreferrer" className={LINK}>
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
              <a href={place.reservationUrl} target="_blank" rel="noreferrer" className={LINK}>
                예약 페이지 열기
              </a>
            </DetailRow>
          )}
        </section>

        <h4 className="mb-3 mt-6 text-[15px] font-black tracking-[-0.03em]">진행·예정 행사</h4>
        {detail.isLoading ? (
          <p className="py-6 text-center text-[13px] font-medium text-black/40">불러오는 중…</p>
        ) : detail.error ? (
          <p className="py-6 text-center text-[13px] font-medium text-black/40">
            행사 정보를 불러오지 못했어요
          </p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-[13px] font-medium text-black/40">
            진행 중이거나 예정된 행사가 없어요
          </p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-black/[0.1] p-4">
                <p className="flex items-center gap-2">
                  <EventChip status={event.status} />
                  <span className="text-[12px] font-extrabold text-black/50">{event.genre}</span>
                </p>
                <p className="mt-1.5 text-[15px] font-black leading-snug tracking-[-0.03em]">
                  {event.title}
                </p>
                <p className="mt-1.5 text-[13px] font-semibold text-black/60">
                  {eventPeriod(event)} ·{' '}
                  <span className={event.isFree ? 'text-[#2F7BF5]' : ''}>
                    {event.isFree ? '무료' : '유료'}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setOpenEventId(openEventId === event.id ? null : event.id)}
                  aria-expanded={openEventId === event.id}
                  className="mt-3 h-10 w-full rounded-lg bg-[#eaf2fe] text-[14px] font-extrabold text-[#2F7BF5]"
                >
                  {openEventId === event.id ? '접기' : '상세보기'}
                </button>
                {openEventId === event.id && <EventDetailBody event={event} />}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-1 text-[11px] font-medium leading-relaxed text-black/35">
          <p>데이터 기준일 {place.collectedAt}</p>
          <p>데이터 출처 {dataSource(place, events.length > 0)}</p>
          {place.imageUrl && place.imageSource && (
            <p>
              사진 출처{' '}
              <a
                href={place.imageSource.split(' ')[0]}
                target="_blank"
                rel="noreferrer"
                className="text-inherit underline"
              >
                {place.imageSource.split(' ')[0].replace(/^https?:\/\//, '')}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EventDetailBody({ event }) {
  return (
    <div className="mt-3 border-t border-black/[0.07] pt-1">
      <DetailRow label="기간">
        {!event.start || event.start === event.end ? event.end : `${event.start} ~ ${event.end}`}
      </DetailRow>
      {event.showtime && <DetailRow label="시간">{event.showtime}</DetailRow>}
      {event.price && <DetailRow label="요금">{event.price}</DetailRow>}
      {event.rating && <DetailRow label="관람등급">{event.rating}</DetailRow>}
      {event.runtime && <DetailRow label="러닝타임">{event.runtime}</DetailRow>}
      {event.enterprise && <DetailRow label="주최·기획">{event.enterprise}</DetailRow>}
      {event.casting && <DetailRow label="출연">{event.casting}</DetailRow>}
      {event.crew && <DetailRow label="제작진">{event.crew}</DetailRow>}
      {event.detailUrl && (
        <a
          href={event.detailUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 grid h-11 place-items-center rounded-lg bg-[#2F7BF5] text-[14px] font-black text-white no-underline"
        >
          공식 상세 안내 · 예매
        </a>
      )}
      <p className="mt-2 text-[11px] font-medium text-black/35">
        데이터 기준일 {event.collectedAt}
      </p>
    </div>
  );
}

export function FilterGroup({ title, children }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[13px] font-black text-black/60">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
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
  );
}

const CHIP =
  'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-extrabold shadow-[0_2px_8px_rgba(23,25,35,0.14)] transition';

// 상단 카테고리 칩 + 요금 칩 (FR-MAP-004, FR-MAP-024). 장소 0곳인 카테고리는 숨김
export function ChipBar({ categories, category, onCategory, fee, onFee, height }) {
  const items = [{ code: 'all', label: '전체', color: '' }, ...categories];
  return (
    <DragScroll
      role="group"
      ariaLabel="분류 필터"
      className="no-scrollbar absolute inset-x-0 top-0 z-40 flex items-center gap-1.5 overflow-x-auto px-2.5"
      style={{ height }}
    >
      {items.map((item) => {
        const active = category === item.code;
        return (
          <Fragment key={item.code}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onCategory(item.code)}
              className={`${CHIP} ${active ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/70'}`}
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
                type="button"
                aria-pressed={fee !== 'all'}
                onClick={() => onFee(fee === 'all' ? 'free' : fee === 'free' ? 'paid' : 'all')}
                className={`${CHIP} ${fee !== 'all' ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/70'}`}
              >
                {fee === 'paid' ? '유료' : '무료'}
              </button>
            )}
          </Fragment>
        );
      })}
    </DragScroll>
  );
}

// 위치 권한 켜는 방법 (FR-MAP-016). 웹은 기기 설정을 직접 열 수 없어 브라우저별 방법을 보여준다
const GUIDES = [
  {
    id: 'ios',
    label: 'iPhone·iPad Safari',
    steps:
      '주소창의 가가(aA) → 웹 사이트 설정 → 위치 → 허용. 그래도 안 되면 설정 앱 → 개인정보 보호 및 보안 → 위치 서비스 → Safari 웹 사이트 → 앱을 사용하는 동안',
  },
  { id: 'android', label: 'Android Chrome', steps: '주소창 왼쪽 아이콘 → 권한 → 위치 → 허용' },
  {
    id: 'desktop',
    label: 'PC Chrome·Edge',
    steps: '주소창 왼쪽 사이트 정보 아이콘 → 위치 → 허용 → 새로고침',
  },
  {
    id: 'mac',
    label: 'Mac Safari',
    steps: 'Safari 메뉴 → 설정 → 웹 사이트 → 위치 → 이 사이트 허용',
  },
];

function browserGuide() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Edg/.test(ua)) return 'mac';
  return 'desktop';
}

export function LocationGuide({ top, onRetry, onClose }) {
  const mine = browserGuide();
  const list = [...GUIDES.filter((g) => g.id === mine), ...GUIDES.filter((g) => g.id !== mine)];
  return (
    <section
      role="dialog"
      aria-label="위치 권한 켜는 방법"
      className="absolute inset-x-2.5 z-[26] rounded-xl bg-white p-4 shadow-[0_6px_20px_rgba(23,25,35,0.18)]"
      style={{ top }}
    >
      <div className="flex items-start justify-between">
        <h2 className="text-[14px] font-black">위치 권한 켜는 방법</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-m-2 grid size-10 place-items-center text-black/40"
        >
          <Glyph name="close" className="size-4" />
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {list.map((g, i) => (
          <li key={g.id} className={i === 0 ? '' : 'opacity-60'}>
            <p className="text-[12px] font-extrabold">
              {g.label}
              {i === 0 && <span className="ml-1 text-[#6678c8]">지금 쓰는 브라우저</span>}
            </p>
            <p className="text-[12px] font-medium leading-snug text-black/60">{g.steps}</p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-10 w-full rounded-lg border border-[#6678c8] text-[13px] font-extrabold text-[#6678c8]"
      >
        권한을 켰어요, 다시 시도
      </button>
    </section>
  );
}
