// 문화 파트 수집 데이터(culture.csv, events.csv, places.csv) → DB 행 변환 규칙
// DB 안내 규칙:
//   1. 정책명·신청기간·신청URL·지원내용 → policy / 분야별 정보 → culture_detail
//   2. 자격 조건 → policy.eligibility_conditions(JSON)
//   3. API 원본 → policy_source.raw_data
//   4. 금액은 원 단위 정수, 못 찾은 값은 NULL
//   5. 모집상태·D-day는 저장하지 않음 (v_policy_status)
import { createHash } from 'node:crypto';

// 재실행해도 같은 행을 가리키도록 policy_id·place_id를 UUID v5로 고정한다.
const NAMESPACE = '973634dd-6357-4e9e-baea-59a8772c91e6';

export function uuidv5(name, ns = NAMESPACE) {
  const nsBytes = Buffer.from(ns.replace(/-/g, ''), 'hex');
  const b = createHash('sha1')
    .update(nsBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const policyIdOf = (externalId) => uuidv5(`policy:culture:${externalId}`);
export const placeIdOf = (placeKey) => uuidv5(`place:${placeKey}`);

// ---------------------------------------------------------------------
// 공통 값 처리
// ---------------------------------------------------------------------
const UNKNOWN = new Set(['', '확인필요', '미확인', '데이터부족']);
const NO_LIMIT = /^(제한없음|무관|해당없음|없음)/;

export function clean(v) {
  const s = (v ?? '').trim();
  return UNKNOWN.has(s) ? null : s;
}

function ymd(y, m, d) {
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d)
    return null;
  return dt.toISOString().slice(0, 10);
}

// 날짜 표기가 섞여 있다: 2026-03-03, 2025.01.08, 10-7-2026(엑셀 M-D-YYYY), 46078(엑셀 일련번호)
export function toDate(v) {
  const s = (v ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/))) return ymd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) return ymd(m[3], m[1], m[2]);
  if (/^\d{5}$/.test(s)) {
    return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

export const kstStart = (date) => (date ? `${date}T00:00:00+09:00` : null);
export const kstEnd = (date) => (date ? `${date}T23:59:59+09:00` : null);

const toUrl = (v) => {
  const s = clean(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

const toInt = (v) => (/^\d+$/.test((v ?? '').trim()) ? Number(v) : null);

// 온통청년은 연령 제한 없음을 0으로 준다 → NULL
const toAge = (v) => {
  const n = toInt(v);
  return n && n > 0 ? n : null;
};

export const REGION_CODE = {
  전국: 'KR',
  부산: '26',
  부산광역시: '26',
  부산진구: '26230',
  사하구: '26380',
};

// ---------------------------------------------------------------------
// culture.csv (정책·공간 운영 사업)
// ---------------------------------------------------------------------
// 세부분류 → 대분류(policy_category) + culture_type. 여기에 없는 세부분류는 이번에 적재하지 않는다.
export const CULTURE_SUBCATEGORY = {
  '기타 문화·여가': { category: '문화', cultureType: '문화프로그램' },
  '예술인·창작 지원': { category: '문화', cultureType: '창작지원' },
  '문화비·이용권 지원': { category: '문화', cultureType: '문화비지원' },
  '문화예술 교육·인력양성': { category: '문화', cultureType: '교육·인력양성' },
  '청년공간·시설': { category: '공간·시설', cultureType: '청년공간' },
};

// 지원금액 원문에서 1인당 금액을 하나로 정할 수 있는 것만 숫자로 둔다. 나머지는 NULL + 원문.
export const SUPPORT_AMOUNT = {
  'YCU-002': 100000, // 자격시험 응시료 실비 1인 최대 10만원
  'YCU-008': 100000, // 10만원(문화예술패스 포인트)
  'YCU-009': 150000, // 1인 15만원
  'YCU-010': 200000, // 1인당 연간 최대 20만원
  'YCU-011': 100000, // 1인 최대 10만원
  'YCU-022': 200000, // 비수도권(부산) 20만원
  'YCU-025': 9000000, // 월 100만원씩 9개월(900만원)
  'YCU-032': 9000000, // 연 900만원
  'YCU-033': 2400000, // 1인 최대 240만원
};

// 이용료가 무료라고 원문에 적힌 사업 (culture_detail.price = 0)
export const FREE_PRICE = new Set(['YCU-006', 'YCU-013', 'YCU-029']);

// 공간 운영 사업 ↔ places.csv 장소
export const POLICY_PLACE = {
  'YCU-001': 'YSP-1dd9ce84', // 부산진구청년플랫폼 청년 FLEX
  'YCU-002': 'YSP-307fa1e4', // 부산진구 청년마루
};

// 준비물 원문을 규칙으로 나누기 어려운 행은 직접 정한다.
// 원문에 "미확인"이 있으면 NULL(확인필요), 서류가 없다고 적혀 있으면 [].
export const DOCUMENT_OVERRIDE = {
  'YCU-002': [
    { name: '주민등록(1년 이상 거주 확인용)', confirmed: false },
    { name: '응시료 영수증', confirmed: false },
  ],
  'YCU-003': [
    { name: '스마트폰(앱 "현충시설 기념관 안내" 설치·휴가자 정보 등록)' },
    { name: '휴가증' },
  ],
  'YCU-006': [{ name: '대관 신청서(청년작당소 홈페이지 다운로드)' }],
  'YCU-007': [],
  'YCU-029': [{ name: '대관 신청서(청년작당소 홈페이지 다운로드)' }],
};

// 괄호 밖의 구분자로만 자른다.
function splitTopLevel(text, seps) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([「'.includes(c)) depth++;
    if (')]」'.includes(c)) depth = Math.max(0, depth - 1);
    const sep = depth === 0 && seps.find((s) => text.startsWith(s, i));
    if (sep) {
      out.push(cur);
      cur = '';
      i += sep.length - 1;
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

export function toDocuments(dataId, text) {
  let items;
  if (dataId in DOCUMENT_OVERRIDE) {
    items = DOCUMENT_OVERRIDE[dataId];
  } else {
    const s = clean(text);
    if (!s || /미확인/.test(s)) return null;
    items = [];
    if (/[①-⑳]/.test(s)) {
      for (const part of s.split(/[①-⑳]/)) if (part.trim()) items.push({ name: part.trim() });
    } else {
      for (const group of splitTopLevel(s, [' / '])) {
        const label = group.match(/^\[([^\]]+)\]\s*/);
        const body = label ? group.slice(label[0].length) : group;
        for (const part of splitTopLevel(body, [',', ';', ' + '])) {
          if (/신청 가능$|별도 제출서류 없음|별도 서류/.test(part)) continue; // 서류가 아닌 안내 문구
          items.push({
            name: label ? `[${label[1]}] ${part}` : part,
            required: !(label && label[1] === '기업') && !/해당 시|해당자/.test(part),
          });
        }
      }
    }
  }
  return items.map((it, i) => ({
    key: `d${i + 1}`,
    name: it.name,
    required: it.required ?? true,
    confirmed: it.confirmed ?? !/공고.{0,4}확인|미확인/.test(it.name),
  }));
}

export function toProcess(text) {
  const s = clean(text);
  if (!s) return null;
  return s
    .replace(/, (\[[^\]]+\])/g, ' > $1')
    .split(' > ')
    .map((x) => x.trim())
    .filter(Boolean);
}

// eligibility.service.js 형식: { all: [조건], exclude: [{ text }] }
// 나이·지역은 판정 가능한 조건으로, 나머지 자격 문구는 op "text"로 둔다.
// op "text"는 판정기에 없는 연산자라 UNKNOWN(확인 필요)으로 처리되고, value에 원문이 남는다.
export function toEligibility(r) {
  const all = [];
  const exclude = [];
  const min = toAge(r['최소연령']);
  const max = toAge(r['최대연령']);
  if (min != null || max != null) all.push({ field: 'age', op: 'between', value: [min, max] });

  const gu = REGION_CODE[(r['대상시군구'] ?? '').trim()];
  if (gu && gu.length === 5) all.push({ field: 'region', op: 'eq', value: gu });
  else if ((r['대상시도'] ?? '').trim() === '부산광역시')
    all.push({ field: 'region', op: 'starts_with', value: '26' });

  const months = toInt(r['거주기간_개월']);
  if (months) all.push({ field: 'residence_months', op: 'gte', value: months });

  const text = (field, raw, skip = []) => {
    const v = clean(raw);
    if (!v || NO_LIMIT.test(v) || skip.includes(v)) return;
    all.push({ field, op: 'text', value: v });
  };
  text('current_status', r['취업상태']);
  text('final_education', r['학력·재학조건']);
  text('income', r['소득조건']);
  text('special_targets', r['특화대상'], ['청년', '청년층 이용 가능 시설 포함']);

  const ex = clean(r['제외대상']);
  if (ex && !NO_LIMIT.test(ex))
    for (const t of ex.split('|')) if (t.trim()) exclude.push({ text: t.trim() });

  const checked = [
    '최소연령',
    '최대연령',
    '대상시도',
    '대상시군구',
    '취업상태',
    '학력·재학조건',
    '소득조건',
    '특화대상',
    '제외대상',
  ];
  const verified = checked.every((k) => (r[k] ?? '').trim() !== '확인필요');

  return { conditions: { all, exclude }, verified, min, max };
}

function sourceOf(note) {
  if (/온통청년 API/.test(note)) return { name: '온통청년 API', type: 'API' };
  if (/온통청년 상세페이지/.test(note))
    return { name: '온통청년 상세페이지(수동 수집)', type: 'MANUAL' };
  return { name: '수동 입력', type: 'MANUAL' };
}

function incomeText(v) {
  const s = clean(v);
  if (!s) return null;
  return ['무관', '제한없음', '해당없음'].includes(s) ? '제한없음' : s;
}

export function mapCultureRow(r, { rawItem, placeKeys }) {
  const sub = CULTURE_SUBCATEGORY[r['세부분류']];
  const id = r['data_id'].trim();
  const policyId = policyIdOf(id);
  const elig = toEligibility(r);
  const always = r['상시모집'] === '예' || r['신청시작일'] === '상시' || r['신청마감일'] === '상시';
  const lastVerified = toDate(r['최종확인일']);
  const src = sourceOf(r['비고']);
  const cultureType = /할인/.test(r['정책명']) ? '문화할인' : sub.cultureType;
  const placeKey = POLICY_PLACE[id];

  const policy = {
    policy_id: policyId,
    _category_name: sub.category,
    title: r['정책명'].trim(),
    collection_domain: 'CULTURE',
    item_type: 'POLICY',
    target_summary: clean(r['지원대상_원문']),
    support_content: clean(r['지원내용']),
    benefit_type: clean(r['추가태그'])?.split('|').join(', ') ?? null,
    min_age: elig.min,
    max_age: elig.max,
    income_condition: incomeText(r['소득조건']),
    application_start_date: toDate(r['신청시작일']),
    application_end_date: toDate(r['신청마감일']),
    is_always_open: always,
    application_method: clean(r['신청방법']),
    application_url: toUrl(r['신청URL']),
    official_url: toUrl(r['원문URL']),
    eligibility_conditions: elig.conditions,
    eligibility_verified: elig.verified,
    application_process: toProcess(r['신청 절차도']),
    required_documents: toDocuments(id, r['신청준비물_정리']),
    last_verified_at: kstStart(lastVerified),
    last_collected_at: kstStart(toDate(r['수집일'])),
  };

  const detail = {
    policy_id: policyId,
    culture_type: cultureType,
    genre: null,
    place_id: placeKey && placeKeys.has(placeKey) ? placeIdOf(placeKey) : null,
    venue_text: null,
    event_start_at: kstStart(toDate(r['운영시작일'])),
    event_end_at: kstEnd(toDate(r['운영종료일'])),
    schedule_text: null,
    price: FREE_PRICE.has(id) ? 0 : null,
    price_text: null,
    support_amount: SUPPORT_AMOUNT[id] ?? null,
    support_amount_text: clean(r['지원금액']),
    discount_rate: null,
    discount_text: cultureType === '문화할인' ? clean(r['지원내용']) : null,
    reservation_required: null,
    reservation_url: null,
    capacity: null,
    age_rating: null,
  };

  const source = {
    policy_id: policyId,
    source_name: src.name,
    source_type: src.type,
    external_id: id,
    source_url: policy.official_url,
    raw_data: rawItem ?? r,
    last_checked_at: policy.last_verified_at,
  };

  const regionCode = REGION_CODE[(r['신청범위'] ?? '').trim()];
  const regions = regionCode ? [{ policy_id: policyId, region_code: regionCode }] : [];

  return { policy, detail, source, regions, meta: { id, rawFrom: rawItem ? 'api' : 'csv' } };
}

// ---------------------------------------------------------------------
// events.csv (부산 다봄 공연·전시)
// ---------------------------------------------------------------------
export const GENRE = {
  classic: ['클래식', 'Classic'],
  concert: ['콘서트', 'Concert'],
  dance: ['무용', 'Dance'],
  etc: ['기타', 'Etc'],
  exhibit: ['전시', 'Exhibit'],
  musical: ['뮤지컬', 'Musical'],
  opera: ['오페라', 'Opera'],
  play: ['연극', 'Play'],
  tradition: ['전통예술', 'Tradition'],
};

export function eventPrice(e) {
  if (e.is_free === '1') return 0;
  const raw = e.price_raw ?? '';
  if (e.is_free === '' && /^무료/.test(raw.trim())) return 0;
  // "전석 20,000원", "R석 3만원" 모두 읽는다. 등급별 요금이면 최저가.
  const amounts = [...raw.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만\s*)?원/g)]
    .map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 10000 : 1))
    .filter((n) => n > 0);
  return amounts.length ? Math.min(...amounts) : null;
}

export function mapEventRow(e, { detailItem, placeByKey }) {
  const policyId = policyIdOf(e.event_id);
  const extra = JSON.parse(e.extra_json || '{}');
  const [genreKo, svc] = GENRE[e.genre] ?? [e.genre, 'Etc'];
  const venue = /선택해주세요/.test(e.place_name_raw) ? null : clean(e.place_name_raw);
  const place = placeByKey.get(e.place_id);
  const rating = clean(extra.rating);
  const priceRaw = clean(e.price_raw);
  const collected = kstStart(toDate(e.collected_at));

  const policy = {
    policy_id: policyId,
    _category_name: '문화',
    title: e.title.trim(),
    collection_domain: 'CULTURE',
    item_type: 'EVENT',
    target_summary: rating,
    support_content: [extra.prg_nm || genreKo, venue, priceRaw].filter(Boolean).join(' · '),
    benefit_type: null,
    min_age: null,
    max_age: null,
    income_condition: null,
    application_start_date: null, // 정의서: 예약이 따로 없으면 신청 기간은 NULL
    application_end_date: null,
    is_always_open: false,
    application_method: null,
    application_url: null,
    official_url: toUrl(e.detail_url),
    eligibility_conditions: null, // 정의서: 행사는 자격 판정 대신 원문 자격 표시
    eligibility_verified: false,
    application_process: null,
    required_documents: null,
    last_verified_at: null,
    last_collected_at: collected,
  };

  const detail = {
    policy_id: policyId,
    culture_type: e.genre === 'exhibit' ? '전시' : e.genre === 'etc' ? '문화프로그램' : '공연',
    genre: clean(extra.prg_nm) ?? genreKo,
    place_id: place ? place.place_id : null,
    venue_text: venue,
    event_start_at: kstStart(toDate(e.start_date)),
    event_end_at: kstEnd(toDate(e.end_date)),
    schedule_text: clean(e.showtime_raw),
    price: eventPrice(e),
    price_text: priceRaw,
    support_amount: null,
    support_amount_text: null,
    discount_rate: null,
    discount_text: null,
    reservation_required: null,
    reservation_url: null,
    capacity: null,
    age_rating: rating,
  };

  // 원본: 상세 API 응답. 없으면 수집 행(카카오 매칭 흔적인 place_match는 뺀다).
  let raw = detailItem;
  if (!raw) {
    const { place_match, ...rest } = e;
    raw = { ...rest, extra_json: extra };
    if (place_match === 'kakao_resolved') delete raw.place_id;
  }

  const source = {
    policy_id: policyId,
    source_name: `부산광역시 문화 API BusanCulture${svc}${detailItem ? 'Detail' : ''}Service`,
    source_type: 'API',
    external_id: e.event_id,
    source_url: policy.official_url,
    raw_data: raw,
    last_checked_at: collected,
  };

  const regions = [{ policy_id: policyId, region_code: place?.region_code ?? '26' }];
  return {
    policy,
    detail,
    source,
    regions,
    meta: { id: e.event_id, rawFrom: detailItem ? 'api' : 'csv' },
  };
}

// ---------------------------------------------------------------------
// places.csv → place
// ---------------------------------------------------------------------
function toCoord(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b)) return [null, null];
  if (a < 33 || a > 39 || b < 124 || b > 132) return [null, null]; // 국내 범위 밖
  return [a, b];
}

// 공연장 목록 API(BusanCulturePerformPlaceService)에서 왔고 원본 장르가 '종합'이라 공연장으로 분류됐지만
// 이름·성격이 갤러리인 곳 (PR #2 리뷰, 2026-11-11)
export const PLACE_TYPE_OVERRIDE = {
  'CUL-BCP00376': '전시공간', // 갤러리라함
  'CUL-BCP00383': '전시공간', // 부산시민공원 예술촌갤러리2
  'CUL-BCP00384': '전시공간', // 부산시민공원 다솜갤러리
  'CUL-BCP00401': '전시공간', // 갤러리 인터페이스
  'CUL-FC002803': '전시공간', // 부산갤러리
  'CUL-FC004877': '전시공간', // 초읍동새마을금고 본점 우리동네MG갤러리
};

export function mapPlaceRow(p) {
  const [lat, lng] = toCoord(p.lat, p.lng);
  const flag = { 1: true, 0: false };
  return {
    place_id: placeIdOf(p.place_id),
    place_key: p.place_id,
    name: p.name.trim(),
    place_type: PLACE_TYPE_OVERRIDE[p.place_id] ?? p.place_type,
    region_code: REGION_CODE[p.sigungu] ?? null,
    address: clean(p.addr),
    road_address: clean(p.addr_road),
    jibun_address: clean(p.addr_jibun),
    lat,
    lng,
    coord_status: clean(p.coord_status),
    tel: clean(p.tel),
    homepage_url: toUrl(p.homepage),
    open_hours_text: clean(p.open_hours_raw),
    closed_days_text: clean(p.closed_days_raw),
    fee_text: clean(p.fee_raw),
    is_free: flag[p.is_free] ?? null,
    reservation_url: toUrl(p.reservation_url),
    capacity: toInt(p.capacity),
    is_active: p.active !== '0',
    source_name: clean(p.source_api),
    source_id: clean(p.source_id),
    raw_data: { ...p, extra_json: JSON.parse(p.extra_json || '{}') },
    last_collected_at: kstStart(toDate(p.collected_at)),
    last_verified_at: kstStart(toDate(p.fee_checked_at)),
  };
}
