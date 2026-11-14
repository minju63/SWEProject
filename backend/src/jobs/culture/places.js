/*
 * 장소 수집·정제 (SRS DP-MAP-01·02, DP-MAP-04, DATA-MAP-01~04)
 * 원천 4종(공연장·전시공간 목록, 전국도서관표준데이터, 전국공공시설개방정보, 청년공간 웹페이지)에서 받은
 * 부산 장소를 모두 place 에 둔다. 사하구·부산진구 장소만 is_target 이 참이고, 지도에는 이 장소만 나온다.
 *   - 이미 있는 장소: 원본 값(이름·주소·전화·홈페이지·운영시간·휴관일·요금 원문·정원·소개)이 바뀌면 반영한다.
 *     DB 값이 지난번 원본 값과 다르면 사람이 고친 값이므로 두고 place_issues 에 기록한다.
 *     주소가 바뀌면 소속 구(region_code, is_target)도 다시 정하고, 좌표는 같은 실행의 좌표 검증이 다시 판정한다.
 *   - 새 장소: 바로 추가한다. 이름과 주소가 모두 같은 장소는 한 행으로 합치고,
 *     이름만 같거나 주소만 같은 장소는 합치지 않고 place_issues 에 병합 후보로 기록한다.
 *   - 원본에서 사라진 장소: 지우지 않고 기록만 한다.
 * 세부 유형은 출처 규칙(처음 정제 busan-culture-api/step1_places.js 와 같음)으로, 요금 구분은 DP-MAP-04 규칙으로 정한다.
 * 지난번 원본 값은 place.source_values 에 둔다. 좌표는 비교·출력하지 않는다.
 */
import { createHash } from 'node:crypto';
import { PLACE_TYPE_OVERRIDE, clean, placeIdOf } from './mapping.js';
import { TARGET_DISTRICTS, normAddr, normName, parseDistrict, text } from './normalize.js';

export const FIELDS = [
  'name',
  'address',
  'tel',
  'homepage_url',
  'open_hours_text',
  'closed_days_text',
  'fee_text',
  'capacity',
  'description',
];
const LABEL = {
  tel: '전화',
  homepage_url: '홈페이지',
  open_hours_text: '운영시간',
  closed_days_text: '휴관일',
  capacity: '정원',
  description: '소개',
  name: '이름',
  address: '주소',
  fee_text: '요금',
};

// 자동 수집하는 출처 (place_key 접두어)
export const SOURCE_LABEL = {
  CUL: '공연장·전시공간 목록',
  LIB: '전국도서관표준데이터',
  OPN: '전국공공시설개방정보',
  YSP: '청년공간 웹페이지',
};
const SOURCE_NAME = {
  CUL: 'BusanCulturePerformPlaceService',
  LIB: 'tn_pubr_public_lbrry_api',
  OPN: 'tn_pubr_public_pblfclt_opn_info_api',
  YSP: 'young.busan.go.kr/space',
};
// 이름과 주소가 모두 같은 새 장소가 여러 출처에 있으면 앞 출처 행을 남긴다.
// 도서관이 공연장 목록에도 '종합'으로 올라 있는 경우가 있어 도서관 목록을 앞에 둔다 (세부 유형이 도서관이 되게)
const PRIORITY = ['LIB', 'CUL', 'OPN', 'YSP'];

// 처음 적재(2026-11-11) 때 서비스 지역 134곳에서 사람이 뺀 22곳. 사유는 남아 있지 않지만 아파트·공원·광장·서점과
// 같은 곳의 다른 행이 섞여 있어, 원본에 계속 있더라도 '사용 안 함'(is_active false)으로 넣는다.
// FR-MAP-001 의 '사용 중' 조건으로 지도에서 빠진다. 다시 보이게 하려면 place.is_active 를 참으로 바꾼다
export const INACTIVE_KEYS = new Set([
  'CUL-BCP00022', // 굿굿웨더
  'CUL-BCP00076', // 소민아트센터
  'CUL-BCP00093', // 서면미술관
  'CUL-BCP00109', // 스테이아웃사이드(유기체)
  'CUL-BCP00185', // 호천문화플랫폼
  'CUL-BCP00220', // 놀이마루
  'CUL-BCP00222', // 감천문화마을
  'CUL-BCP00227', // 부산시민공원
  'CUL-BCP00236', // 사립학교교직원연금공단
  'CUL-BCP00369', // 부산시민공원 미로전시실
  'CUL-BCP00370', // 롯데백화점 2층청년두드림센터 (청년공간 청년두드림센터와 같은 곳)
  'CUL-BCP00388', // 당감2동 중앙체육공원
  'CUL-BCP00391', // 스페이스 별일
  'CUL-BCP00403', // 더샵센트럴스타아파트
  'CUL-FC002610', // 부산광역시립 시민도서관 (공연장으로 올라 있음)
  'CUL-FC002628', // 송상현광장
  'CUL-FC002678', // 감고개공원
  'CUL-FC002762', // 원불교 부산역사기념관
  'CUL-FC002814', // 마스터피스
  'CUL-FC004042', // 유기체 (4F)
  'CUL-FC004387', // 교보문고 부산점
  'CUL-FC004856', // 다대도서관 (공연장으로 올라 있음)
  // 같은 곳의 다른 행 (2026-11-14 사용자 확인: 같은 곳은 쓰지 않음)
  'YSP-7e0d2ee3', // 사하청년창업지원센터 = 기존 YSP-21a7138f 사하구 청년창업지원센터 (주소 같음)
]);

// 공공시설개방 세부 유형 → place_type. 없으면 공공시설
const OPN_TYPE = {
  체육관: '체육시설',
  다목적경기장: '체육시설',
  배드맨턴장: '체육시설',
  테니스장: '체육시설',
  축구장: '체육시설',
  야구장: '체육시설',
  풋살경기장: '체육시설',
  족구장: '체육시설',
  강당: '강의실·강당',
  강의실: '강의실·강당',
  회의실: '회의실',
  전시실: '전시공간',
  '기타(공연장)': '공연장',
};

const md5 = (s) => createHash('md5').update(String(s)).digest('hex');
const val = (v) => clean(text(v) ?? '');
const url = (v) => {
  const s = val(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};
const positive = (v) => {
  const n = Number(text(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};
// 원본 좌표 숫자 (형식만 거른다. 쓸 수 있는지는 좌표 검증이 판정한다)
const coord = (v) => {
  const n = Number(text(v));
  return text(v) && Number.isFinite(n) && Math.abs(n) < 1000 ? n : null;
};
const span = (a, b) => (text(a) || text(b) ? `${text(a) ?? ''}-${text(b) ?? ''}` : '');
const joined = (pairs) =>
  pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join(' / ') || null;

// 요금 구분 (DP-MAP-04): 도서관은 규칙상 무료, 공공시설개방은 원본의 유료 여부, 나머지는 근거가 없어 unknown
const FEE_UNKNOWN = { fee_type: 'unknown', fee_basis: null, is_free: null };
function opnFee(yn) {
  if (yn === 'N') return { fee_type: 'free', fee_basis: 'source', is_free: true };
  if (yn === 'Y') return { fee_type: 'paid', fee_basis: 'source', is_free: false };
  return FEE_UNKNOWN;
}

/*
 * 원본 행 → { key, prefix, district, values, place_type, road, jibun, lat_src, lng_src, fee, reservation_url,
 *             source_name, source_id, raw }
 * values 는 DB 장소와 비교하는 원본 값이고 나머지는 새 장소를 만들 때만 쓴다. 장소 키는 처음 적재(places.csv)와 같은 규칙
 */
export function placeSources({
  performPlaces = [],
  libraries = [],
  publicFacilities = [],
  youthSpaces = [], // youthSpaces.js 가 이미 같은 모양으로 만든 행
}) {
  const out = new Map();
  for (const row of youthSpaces)
    out.set(row.key, {
      place_type: '청년공간',
      road: null,
      jibun: null,
      lat_src: null,
      lng_src: null,
      fee: FEE_UNKNOWN,
      reservation_url: null,
      source_name: row.source_name ?? SOURCE_NAME.YSP,
      source_id: row.values.name,
      raw: row.values,
      ...row,
    });
  for (const x of performPlaces) {
    const key = `CUL-${x.placeId}`;
    const address = val(x.addr);
    const genreType = { 전시: '전시공간', 종합: '공연장' }[text(x.attr_genre)] ?? null;
    out.set(key, {
      key,
      prefix: 'CUL',
      district: parseDistrict(address) ?? parseDistrict(text(x.sigungu)),
      values: {
        name: val(x.placeNm),
        address,
        tel: val(x.tel),
        homepage_url: url(x.url),
        capacity: positive(x.seatCnt),
      },
      place_type: PLACE_TYPE_OVERRIDE[key] ?? genreType,
      road: null,
      jibun: null,
      lat_src: coord(x.lttd),
      lng_src: coord(x.lngt),
      fee: FEE_UNKNOWN,
      reservation_url: url(x.rent_url),
      source_name: SOURCE_NAME.CUL,
      source_id: text(x.placeId),
      raw: x,
    });
  }
  for (const x of libraries) {
    const address = text(x.rdnmadr);
    const key = `LIB-${md5(`lbrry|${x.lbrryNm}|${address}`).slice(0, 8)}`;
    out.set(key, {
      key,
      prefix: 'LIB',
      district: parseDistrict(address),
      values: {
        name: val(x.lbrryNm),
        address: val(address),
        tel: val(x.phoneNumber),
        homepage_url: url(x.homepageUrl),
        open_hours_text: joined([
          ['평일', span(x.weekdayOperOpenHhmm, x.weekdayOperColseHhmm)],
          ['토', span(x.satOperOperOpenHhmm, x.satOperCloseHhmm)],
          ['공휴일', span(x.holidayOperOpenHhmm, x.holidayCloseOpenHhmm)],
        ]),
        closed_days_text: val(x.closeDay),
        capacity: positive(x.seatCo),
      },
      place_type: '도서관',
      road: val(address),
      jibun: null,
      lat_src: coord(x.latitude),
      lng_src: coord(x.longitude),
      fee: { fee_type: 'free', fee_basis: 'rule', is_free: true },
      reservation_url: null,
      source_name: SOURCE_NAME.LIB,
      source_id: `${text(x.lbrryNm)}|${address ?? ''}`,
      raw: x,
    });
  }
  for (const x of publicFacilities) {
    const address = text(x.rdnmadr) ?? text(x.lnmadr);
    const key = `OPN-${md5(`pblfclt|${x.openFcltyNm}|${address}`).slice(0, 8)}`;
    const cur = out.get(key);
    if (cur) {
      // 이름·주소가 같은 행(호실만 다름)은 하나로 본다. 정원은 처음 나온 값
      cur.values.capacity ??= positive(x.aceptncPosblCo);
      continue;
    }
    out.set(key, {
      key,
      prefix: 'OPN',
      district: parseDistrict(address),
      values: {
        name: val(x.openFcltyNm),
        address: val(address),
        tel: val(x.phoneNumber),
        homepage_url: url(x.homepageUrl),
        open_hours_text: joined([
          ['평일', span(x.weekdayOperOpenHhmm, x.weekdayOperColseHhmm)],
          ['주말', span(x.wkendOperOpenHhmm, x.wkendOperCloseHhmm)],
        ]),
        closed_days_text: val(x.rstde),
        fee_text: joined([
          ['이용기준', val(x.useStdrTime)],
          ['임대료', val(x.rntfee)],
          ['초과단위시간', val(x.excessUseUnitTime)],
          ['초과임대료', val(x.excessRntfee)],
        ]),
        capacity: positive(x.aceptncPosblCo),
      },
      place_type: OPN_TYPE[text(x.openFcltyType)] ?? '공공시설',
      road: val(x.rdnmadr),
      jibun: val(x.lnmadr),
      lat_src: coord(x.latitude),
      lng_src: coord(x.longitude),
      fee: opnFee(text(x.pchrgUseYn)),
      reservation_url: null,
      source_name: SOURCE_NAME.OPN,
      source_id: `${text(x.openFcltyNm)}|${address ?? ''}`,
      raw: x,
    });
  }
  return out;
}

const same = (a, b) => (a ?? null) === (b ?? null);
const show = (v) => (v === null || v === undefined || v === '' ? '(없음)' : String(v));
// 원본 기준값이 같은지 항목별로 본다 (DB jsonb 는 키 순서를 바꿔 저장하므로 문자열 비교는 늘 다르게 나온다)
const sameValues = (a, b) =>
  !!a && [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => same(a[k], b[k]));
const fieldsOf = (values) => FIELDS.filter((f) => f in values);
const nameKey = (s) => normName(s);
const addrKey = (s) => (normAddr(s).length >= 6 ? normAddr(s) : null);
const label = (p) => `${p.place_key} ${p.name}`;

/*
 * DB 장소와 원본 비교 → { updates, additions, issues, checkedIds, stat }
 *   places: DB 의 모든 장소 (사용 중이 아닌 장소도 키가 겹치지 않게 넘긴다)
 *   checked: 이번에 원본을 받은 출처 접두어 (받지 못한 출처의 장소는 건드리지 않고, 새 장소도 만들지 않는다)
 *   regions: 구 이름 → region_code
 *   updates: [{ place_id, place_key, name, changes: { 컬럼: 새 값 }, baseline }]
 *   additions: place 에 넣을 새 행 (좌표 검증 전. coord_status 는 원본 좌표 유무로만 정해 둔다)
 */
export function planPlaceSync(places, sources, checked, { regions = new Map(), now, today } = {}) {
  const updates = [];
  const additions = [];
  const checkedIds = []; // 원본과 맞춰 본 장소 (확인 일시를 남긴다)
  const issues = [];
  const stat = { merged: 0, outsideBusan: 0, noType: 0 };
  const known = new Set();
  for (const p of places) {
    known.add(p.place_key);
    for (const m of p.merged_from ?? []) if (m?.place_id) known.add(m.place_id);
  }
  const targetCodes = new Set(TARGET_DISTRICTS.map((d) => regions.get(d)).filter(Boolean));

  for (const p of places.filter((x) => x.is_active)) {
    const prefix = p.place_key.slice(0, 3);
    if (!SOURCE_LABEL[prefix] || !checked.has(prefix)) continue;
    const src = sources.get(p.place_key);
    const ref = { ref_type: 'place', ref_key: p.place_key, place_id: p.place_id, name: p.name };
    if (!src) {
      issues.push({
        ...ref,
        issue_type: 'place_missing_in_source',
        detail: `${SOURCE_LABEL[prefix]}에서 사라짐 (폐관·이름·주소 변경 확인 필요)`,
      });
      continue;
    }
    checkedIds.push(p.place_id);
    const base = p.source_values;
    const changes = {};
    const firstDiffs = [];
    const kept = [];
    for (const f of fieldsOf(src.values)) {
      const next = src.values[f];
      if (!base) {
        if (!same(next, p[f]))
          firstDiffs.push(`${LABEL[f]}: DB ${show(p[f])} / 원본 ${show(next)}`);
        continue;
      }
      if (same(next, base[f])) continue; // 원본이 그대로
      if (same(p[f], base[f])) changes[f] = next;
      else
        kept.push(
          `${LABEL[f]}: 원본 ${show(base[f])} → ${show(next)} (사람이 고친 DB 값 ${show(p[f])} 유지)`
        );
    }
    // 주소가 바뀌면 도로명·지번 주소와 소속 구도 원본을 따른다
    if ('address' in changes) {
      changes.road_address = src.road;
      if (src.prefix === 'OPN') changes.jibun_address = src.jibun;
      const code = regions.get(src.district);
      if (code && code !== p.region_code) changes.region_code = code;
    }
    const target = targetCodes.has(changes.region_code ?? p.region_code);
    if (p.is_target !== undefined && p.is_target !== target) changes.is_target = target;
    if (firstDiffs.length)
      issues.push({
        ...ref,
        issue_type: 'source_differs',
        detail: `처음 비교에서 원본과 다른 값: ${firstDiffs.join(' / ')}`,
      });
    if (kept.length)
      issues.push({ ...ref, issue_type: 'source_changed', detail: kept.join(' / ') });
    if (Object.keys(changes).length || !sameValues(base, src.values))
      updates.push({
        place_id: p.place_id,
        place_key: p.place_key,
        name: p.name,
        changes,
        baseline: src.values,
      });
  }

  // ---------- 새 장소 ----------
  const byNameAddr = new Map(); // 이름+주소 → 장소 (DB 장소와 이번에 추가할 장소)
  const byName = new Map();
  const byAddr = new Map();
  const index = (p, address) => {
    const n = nameKey(p.name);
    const a = addrKey(address);
    if (a) byNameAddr.set(`${n}|${a}`, p);
    if (n.length >= 3) byName.set(n, [...(byName.get(n) ?? []), p]);
    if (a) byAddr.set(a, [...(byAddr.get(a) ?? []), p]);
  };
  for (const p of places) index(p, p.address);

  const fresh = [...sources.values()]
    .filter((s) => checked.has(s.prefix) && !known.has(s.key))
    .sort((a, b) => PRIORITY.indexOf(a.prefix) - PRIORITY.indexOf(b.prefix));
  for (const src of fresh) {
    const v = src.values;
    if (!src.district || !regions.get(src.district)) {
      stat.outsideBusan += 1; // 부산 주소가 아니거나 구를 읽지 못한 행 (처음 정제와 같이 넣지 않음)
      continue;
    }
    if (!src.place_type) {
      stat.noType += 1;
      issues.push({
        ref_type: 'place',
        ref_key: src.key,
        place_id: null,
        name: v.name,
        issue_type: 'new_place_candidate',
        detail: `${SOURCE_LABEL[src.prefix]}의 ${src.district} 장소: 원본 장르로 세부 유형을 정할 수 없어 추가하지 않음`,
      });
      continue;
    }
    const n = nameKey(v.name);
    const a = addrKey(v.address);
    const twin = a ? byNameAddr.get(`${n}|${a}`) : null;
    if (twin) {
      // 이름과 주소가 모두 같다 → 한 행으로 (DP-MAP-02). 이번에 추가하는 행이면 빈 값을 채운다
      stat.merged += 1;
      if (twin._new) {
        for (const f of FIELDS) if (twin[f] == null && v[f] != null) twin[f] = v[f];
        twin.raw_data.extra_json.merged_from.push({
          place_id: src.key,
          source_api: src.source_name,
        });
      }
      continue;
    }
    const code = regions.get(src.district);
    const srcCoord = src.lat_src != null && src.lng_src != null;
    const row = {
      place_id: placeIdOf(src.key),
      place_key: src.key,
      name: v.name,
      place_type: src.place_type,
      region_code: code,
      is_target: targetCodes.has(code),
      address: v.address ?? null,
      road_address: src.road,
      jibun_address: src.jibun,
      lat_src: src.lat_src,
      lng_src: src.lng_src,
      // 좌표 검증 전 값. 같은 실행의 좌표 검증이 판정을 덮어쓴다 (검증이 멈추면 이 값으로 들어간다)
      lat: srcCoord ? src.lat_src : null,
      lng: srcCoord ? src.lng_src : null,
      coord_status: srcCoord ? 'coord_only' : 'missing',
      coord_source: srcCoord ? 'source' : null,
      coord_distance_m: null,
      tel: v.tel ?? null,
      homepage_url: v.homepage_url ?? null,
      open_hours_text: v.open_hours_text ?? null,
      closed_days_text: v.closed_days_text ?? null,
      fee_text: v.fee_text ?? null,
      capacity: v.capacity ?? null,
      description: v.description ?? null,
      fee_type: src.fee.fee_type,
      fee_basis: src.fee.fee_basis,
      fee_source_url: null,
      fee_checked_at: src.fee.fee_basis ? today : null,
      is_free: src.fee.is_free,
      reservation_url: src.reservation_url,
      is_active: !INACTIVE_KEYS.has(src.key),
      source_name: src.source_name,
      source_id: src.source_id,
      raw_data: { ...src.raw, extra_json: { merged_from: [] } },
      source_values: v,
      source_checked_at: now,
      last_collected_at: now,
      _new: true,
    };
    // 이름만 같거나 주소만 같은 장소는 합치지 않고 후보로 기록한다
    const sameName = (n.length >= 3 ? byName.get(n) : null) ?? [];
    const sameAddr = (a ? byAddr.get(a) : null) ?? [];
    const notes = [
      ...sameName.slice(0, 3).map((p) => `같은 이름·다른 주소 ${label(p)}`),
      ...sameAddr.slice(0, 3).map((p) => `같은 주소·다른 이름 ${label(p)}`),
    ];
    if (notes.length)
      issues.push({
        ref_type: 'place',
        ref_key: src.key,
        place_id: row.place_id,
        name: v.name,
        issue_type: 'merge_candidate',
        detail: `${notes.join(' / ')} (같은 곳이면 한 행으로 합칠 것)`,
      });
    row.merged_from = row.raw_data.extra_json.merged_from; // 같은 실행의 행사 장소 연결용 (DB 에는 raw_data 로 들어간다)
    additions.push(row);
    index(row, row.address);
  }
  return { updates, additions, issues, checkedIds, stat };
}
