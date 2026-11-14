// 지도 탭 계산·변환 함수 (Figma data/places.ts, data/events.ts, MapScreen.tsx 에서 옮김)

// DB 시각(UTC 로 옴) → 한국 날짜 YYYY-MM-DD. 문자열을 그냥 자르면 KST 자정 값이 하루 전 날짜가 된다
const kstDate = (iso) =>
  iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : '';

// API 응답(snake_case) → 화면용 장소
export function toPlace(p) {
  return {
    id: p.place_id,
    key: p.place_key,
    name: p.name,
    placeType: p.place_type,
    category: p.category_code,
    categoryName: p.category_name,
    color: p.color,
    regionCode: p.region_code,
    district: p.district,
    address: p.address ?? '',
    lat: Number(p.lat),
    lng: Number(p.lng),
    coordStatus: p.coord_status,
    tel: p.tel ?? '',
    homepage: p.homepage_url ?? '',
    openHours: p.open_hours_text ?? '',
    closedDays: p.closed_days_text ?? '',
    fee: p.fee_text ?? '',
    isFree: p.is_free === true,
    feeType: p.fee_type ?? 'unknown',
    reservationUrl: p.reservation_url ?? '',
    capacity: p.capacity ?? null,
    imageUrl: p.image_url ?? '',
    imageSource: p.image_source ?? '',
    description: p.description ?? '',
    sourceName: p.source_name ?? '',
    // 데이터 기준일: 하루 1회 갱신이 원본과 마지막으로 맞춰 본 날 (없으면 처음 수집일)
    collectedAt: kstDate(p.source_checked_at ?? p.last_collected_at),
    liveEventCount: p.live_event_count ?? 0,
    nextEventStatus: p.next_event_status ?? null,
  };
}

// API 응답 → 화면용 행사
export function toEvent(e) {
  return {
    id: e.policy_id,
    title: e.title,
    genre: e.genre ?? '',
    start: kstDate(e.start_at),
    end: kstDate(e.end_at),
    status: e.status,
    isFree: e.is_free,
    price: e.price_text ?? (e.is_free ? '무료' : ''),
    showtime: e.schedule_text ?? '',
    detailUrl: e.detail_url ?? '',
    rating: e.age_rating ?? '',
    runtime: e.runtime ?? '',
    enterprise: e.organizer ?? '',
    casting: e.casting ?? '',
    crew: e.crew ?? '',
    collectedAt: kstDate(e.collected_at),
  };
}

export function eventPeriod(event) {
  const md = (value) => value.slice(5).replace('-', '.');
  if (!event.start) return md(event.end);
  return event.start !== event.end ? `${md(event.start)} ~ ${md(event.end)}` : md(event.start);
}

export function distanceMeters(a, b) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 1km 미만은 10m 단위, 이상은 소수 첫째 자리 km (FR-MAP-007)
export function formatDistance(meters) {
  const rounded = Math.round(meters / 10) * 10;
  return rounded < 1000 ? `${rounded}m` : `${(meters / 1000).toFixed(1)}km`;
}

// 길찾기: 목적지(장소)만 담는다. 사용자 위치는 넣지 않는다 (FR-MAP-013)
export const kakaoLink = (place) =>
  `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;

// 장소 데이터에 있는 구 (필터 시트의 지역 선택지)
export const districtsOf = (places) =>
  [...new Set(places.map((p) => p.district).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko')
  );

export function centerOf(list) {
  if (!list.length) return null;
  return {
    lat: list.reduce((s, p) => s + p.lat, 0) / list.length,
    lng: list.reduce((s, p) => s + p.lng, 0) / list.length,
  };
}

// 서비스 지역: 표시 대상 장소 좌표의 최소·최대에 0.02도 여유 (FR-MAP-016)
export function serviceArea(places) {
  if (!places.length) return null;
  const lats = places.map((p) => p.lat);
  const lngs = places.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - 0.02,
    maxLat: Math.max(...lats) + 0.02,
    minLng: Math.min(...lngs) - 0.02,
    maxLng: Math.max(...lngs) + 0.02,
  };
}

export const insideArea = (area, pos) =>
  !!area &&
  !!pos &&
  pos.lat >= area.minLat &&
  pos.lat <= area.maxLat &&
  pos.lng >= area.minLng &&
  pos.lng <= area.maxLng;

export function placeMatchesTerm(place, term) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return `${place.name} ${place.address} ${place.district} ${place.placeType} ${place.categoryName}`
    .toLowerCase()
    .includes(q);
}

// 요금: free 는 무료, paid·per_program 은 유료, unknown 은 어느 쪽에도 안 보임 (FR-MAP-024)
export function matchesFee(place, fee) {
  if (fee === 'all') return true;
  const t = place.feeType;
  return fee === 'free' ? t === 'free' : t === 'paid' || t === 'per_program';
}

export const toggleIn = (list, v) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

// ---------------- 운영 중 판정 (FR-MAP-026) ----------------
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function daysOfLabel(label) {
  const range = label.match(/([월화수목금토일])\s*~\s*([월화수목금토일])/);
  if (range) {
    const from = DAY_NAMES.indexOf(range[1]);
    const to = DAY_NAMES.indexOf(range[2]);
    const out = [];
    for (let d = from; ; d = (d + 1) % 7) {
      out.push(d);
      if (d === to) break;
    }
    return out;
  }
  if (/평일/.test(label)) return [1, 2, 3, 4, 5];
  if (/주말/.test(label)) return [0, 6];
  if (/연중무휴|매일/.test(label)) return [0, 1, 2, 3, 4, 5, 6];
  const singles = [...label.replace(/공휴일/g, '').matchAll(/[월화수목금토일]/g)].map((m) =>
    DAY_NAMES.indexOf(m[0])
  );
  return singles.length ? singles : null;
}

function isClosedToday(closed, now) {
  if (!closed) return false;
  const day = now.getDay();
  const week = Math.ceil(now.getDate() / 7);
  const ordinal = [...closed.matchAll(/([첫둘셋넷])째주\s*([월화수목금토일])/g)];
  if (ordinal.length)
    return ordinal.some(
      (m) => DAY_NAMES.indexOf(m[2]) === day && ['첫', '둘', '셋', '넷'].indexOf(m[1]) + 1 === week
    );
  const weekly = closed.match(/([월화수목금토일])\((\d(?:\+\d)*)주\)/);
  if (weekly && DAY_NAMES.indexOf(weekly[1]) === day)
    return weekly[2].split('+').map(Number).includes(week);
  return closed
    .split(/[+,\s]/)
    .some((t) => /^[월화수목금토일](요일)?$/.test(t) && DAY_NAMES.indexOf(t[0]) === day);
}

export function isOpenNow(place, now = new Date()) {
  const text = place.openHours;
  if (!text || isClosedToday(place.closedDays, now)) return false;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const ranges = [...text.matchAll(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return false;
  let sawLabel = false;
  let open = false;
  let cursor = 0;
  for (const m of ranges) {
    const label = text.slice(cursor, m.index);
    cursor = (m.index ?? 0) + m[0].length;
    const days = daysOfLabel(label) ?? (sawLabel ? null : [0, 1, 2, 3, 4, 5, 6]);
    if (label.trim()) sawLabel = true;
    if (!days || !days.includes(day)) continue;
    const start = +m[1] * 60 + +m[2];
    const end = +m[3] * 60 + +m[4];
    if (end === start) continue;
    if (mins >= start && mins < end) open = true;
  }
  return open;
}

// ---------------- 데이터 출처 (상세 하단) ----------------
const SOURCE_TEXT = {
  BusanCulturePerformPlaceService: '부산광역시 공연장·전시공간 목록 (제공기관: 부산광역시)',
  tn_pubr_public_lbrry_api:
    '전국도서관표준데이터 (제공기관: 지방자치단체·교육청, 저작자표시 CC BY)',
  tn_pubr_public_pblfclt_opn_info_api: '전국공공시설개방정보표준데이터 (제공기관: 지방자치단체)',
  'young.busan.go.kr/space': '부산청년플랫폼 청년공간 (young.busan.go.kr/space)',
  'saha.go.kr/startup': '사하구 청년창업 (saha.go.kr/startup)',
};

export function dataSource(place, hasEvents) {
  const lines = [SOURCE_TEXT[place.sourceName] ?? place.sourceName];
  if (hasEvents) lines.push('부산광역시 문화 행사 목록 (제공기관: 부산광역시)');
  return lines.filter(Boolean).join(' / ');
}
