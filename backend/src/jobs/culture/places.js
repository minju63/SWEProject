/*
 * 장소 원본 비교 (SRS DATA-MAP-01~03, DP-MAP-02)
 * 장소는 좌표 보정·요금 구분·사진을 사람이 손본 값이라 원본으로 덮어쓰지 않는다.
 *   - 자동 반영: 전화·홈페이지·운영시간·휴관일·정원. 원본이 바뀌었고 DB 값이 지난번 원본 값 그대로일 때만 바꾼다
 *     (DB 값이 다르면 사람이 고친 것이므로 두고 place_issues 에 기록).
 *   - 기록만: 이름·주소·요금 원문 변경, 원본에서 사라진 장소, 서비스 지역의 새 장소 후보.
 * 지난번 원본 값은 place.source_values 에 둔다. 처음 실행하면 원본 값만 저장하고, DB 와 다른 항목은 확인용으로 기록한다.
 * 좌표는 비교·출력하지 않는다.
 */
import { createHash } from 'node:crypto';
import { clean } from './mapping.js';
import { TARGET_DISTRICTS, normAddr, normName, parseDistrict, text } from './normalize.js';

export const AUTO_FIELDS = [
  'tel',
  'homepage_url',
  'open_hours_text',
  'closed_days_text',
  'capacity',
  'description',
];
export const WATCH_FIELDS = ['name', 'address', 'fee_text'];
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
const span = (a, b) => (text(a) || text(b) ? `${text(a) ?? ''}-${text(b) ?? ''}` : '');
const joined = (pairs) =>
  pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join(' / ') || null;

// 원본 행 → { key, prefix, name, district, values }. 장소 키는 처음 적재할 때(places.csv)와 같은 규칙
export function placeSources({
  performPlaces = [],
  libraries = [],
  publicFacilities = [],
  youthSpaces = [], // youthSpaces.js 가 이미 같은 모양으로 만든 행
}) {
  const out = new Map();
  for (const row of youthSpaces) out.set(row.key, row);
  for (const x of performPlaces) {
    const address = val(x.addr);
    out.set(`CUL-${x.placeId}`, {
      key: `CUL-${x.placeId}`,
      prefix: 'CUL',
      district: parseDistrict(address) ?? text(x.sigungu),
      values: {
        name: val(x.placeNm),
        address,
        tel: val(x.tel),
        homepage_url: url(x.url),
        capacity: positive(x.seatCnt),
      },
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
    });
  }
  return out;
}

const same = (a, b) => (a ?? null) === (b ?? null);
const show = (v) => (v === null || v === undefined || v === '' ? '(없음)' : String(v));
// 원본 기준값이 같은지 항목별로 본다 (DB jsonb 는 키 순서를 바꿔 저장하므로 문자열 비교는 늘 다르게 나온다)
const sameValues = (a, b) =>
  !!a && [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => same(a[k], b[k]));
const fieldsOf = (values) => [...AUTO_FIELDS, ...WATCH_FIELDS].filter((f) => f in values);

/*
 * DB 장소와 원본 비교 → { updates, issues, checkedKeys }
 *   updates: [{ place_id, place_key, name, changes: { 필드: 새 값 }, baseline }]
 *   checked: 이번에 원본을 받은 출처 접두어 (받지 못한 출처의 장소는 건드리지 않는다)
 */
export function planPlaceSync(places, sources, checked) {
  const updates = [];
  const checkedIds = []; // 원본과 맞춰 본 장소 (확인 일시를 남긴다)
  const issues = [];
  const known = new Set();
  for (const p of places) {
    known.add(p.place_key);
    for (const m of p.merged_from ?? []) if (m?.place_id) known.add(m.place_id);
  }

  for (const p of places) {
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
      const now = src.values[f];
      if (!base) {
        if (!same(now, p[f])) firstDiffs.push(`${LABEL[f]}: DB ${show(p[f])} / 원본 ${show(now)}`);
        continue;
      }
      if (same(now, base[f])) continue; // 원본이 그대로
      if (AUTO_FIELDS.includes(f) && same(p[f], base[f])) changes[f] = now;
      else
        kept.push(
          `${LABEL[f]}: 원본 ${show(base[f])} → ${show(now)}` +
            (AUTO_FIELDS.includes(f) ? ` (사람이 고친 DB 값 ${show(p[f])} 유지)` : ' (반영 안 함)')
        );
    }
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

  // 서비스 지역의 새 장소 후보 (이름이 같은 장소가 이미 있으면 후보에서 뺀다)
  // 주소가 같은 장소는 합치지 않고 후보 설명에 적는다 (DP-MAP-02)
  const names = new Set(places.map((p) => normName(p.name)));
  const byAddress = new Map(places.filter((p) => p.address).map((p) => [normAddr(p.address), p]));
  for (const src of sources.values()) {
    if (!checked.has(src.prefix) || known.has(src.key)) continue;
    if (!TARGET_DISTRICTS.includes(src.district) || names.has(normName(src.values.name))) continue;
    const sameAddress = src.values.address ? byAddress.get(normAddr(src.values.address)) : null;
    issues.push({
      ref_type: 'place',
      ref_key: src.key,
      place_id: null,
      name: src.values.name,
      issue_type: 'new_place_candidate',
      detail:
        `${SOURCE_LABEL[src.prefix]}의 ${src.district} 장소: ${show(src.values.address)}` +
        (sameAddress
          ? ` · 주소가 같은 기존 장소 ${sameAddress.place_key} ${sameAddress.name} (같은 곳이면 무시)`
          : ' (좌표 검증·분류·요금 확인 후 추가)'),
    });
  }
  return { updates, issues, checkedIds };
}
