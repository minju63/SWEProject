// 행사 정제와 장소 연결 (SRS DP-MAP-01·02)
// 만든 행은 events.csv 와 같은 모양이라 mapping.js 의 mapEventRow 로 DB 행이 된다.
import { EVENT_GENRES } from './sources.js';
import { TARGET_DISTRICTS, freeText, normName, parseDistrict, text } from './normalize.js';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== '0000-00-00';

// 무료 여부 '1'·'0'·'' (pay_at=N 또는 요금 원문이 무료일 때만 무료. 표기가 서로 어긋나면 비워 둔다)
function freeFlag(payAt, price) {
  const amount = /\d[\d,]*\s*원|\d+\s*만\s*원|\d{1,3},\d{3}|만원|₩/.test(price);
  const free = /무료/.test(price);
  if (payAt === 'N') return amount ? '' : '1';
  if (free) return amount || payAt === 'Y' ? '' : '1';
  return amount || payAt === 'Y' ? '0' : '';
}

// 목록 → 진행 중·예정 행사. res_no 중복은 앞 장르, 날짜가 비정상이거나 끝난 행사는 뺀다 (DP-MAP-01)
export function liveEvents(lists, today) {
  const seen = new Set();
  const live = [];
  let skipped = 0;
  for (const genre of Object.keys(EVENT_GENRES)) {
    for (const item of lists[genre] ?? []) {
      const resNo = String(item.res_no);
      if (seen.has(resNo)) continue;
      seen.add(resNo);
      const start = String(item.op_st_dt ?? '');
      const end = String(item.op_ed_dt ?? '');
      if (!isDate(start) || !isDate(end) || start > end || end < today) {
        skipped += 1;
        continue;
      }
      live.push({ genre, resNo, item, start, end });
    }
  }
  return { live, skipped };
}

function placeIndex(places) {
  const byKey = new Map();
  const byName = new Map();
  for (const p of places) {
    byKey.set(p.place_key, p);
    for (const m of p.merged_from ?? []) if (m?.place_id) byKey.set(m.place_id, p); // 다른 출처와 합친 장소
    const k = normName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  return { byKey, byName };
}

function venueIndex(performPlaces) {
  const byId = new Map();
  const byName = new Map();
  for (const v of performPlaces) {
    const row = {
      id: String(v.placeId),
      name: text(v.placeNm),
      district: parseDistrict(text(v.addr)) ?? text(v.sigungu),
    };
    byId.set(row.id, row);
    const k = normName(row.name);
    byName.set(k, [...(byName.get(k) ?? []), row]);
  }
  return { byId, byName };
}

const only = (list) => (list?.length === 1 ? list[0] : null);

function unmatchedReason(venue, name) {
  if (!name) return '행사에 장소명이 없음';
  if (venue?.district && !TARGET_DISTRICTS.includes(venue.district))
    return `서비스 지역 밖(${venue.district})`;
  if (venue?.district)
    return `서비스 지역(${venue.district}) 안인데 장소 목록에 없음 → 장소 추가 검토`;
  return '장소 목록·공연장 목록에서 찾지 못함';
}

/*
 * 진행 중·예정 행사 → events.csv 모양 행 + 상세 원본
 * 장소 연결 순서: 테마·상세 API 의 장소 번호 → 장소명이 하나만 같은 장소.
 * 장소 번호가 공연장 목록에 있는데 우리 장소(서비스 지역)가 아니면 이름으로 다시 찾지 않는다.
 */
export function buildEventRows({ live, themes, details, places, performPlaces, today }) {
  const themeByRes = new Map();
  for (const t of themes)
    if (!themeByRes.has(String(t.res_no))) themeByRes.set(String(t.res_no), t);
  const { byKey, byName } = placeIndex(places);
  const venues = venueIndex(performPlaces);

  const rows = [];
  const unmatched = new Map();
  const stat = { byId: 0, byName: 0, unmatched: 0 };
  for (const { genre, resNo, item: e, start, end } of live) {
    const t = themeByRes.get(resNo);
    const d = details.get(`${genre}-${resNo}`) ?? null;
    const pid = text(t?.place_id) ?? text(d?.place_id);
    const name = text(e.place_nm);
    const venueName = name && !/선택해주세요/.test(name) ? name : null;

    let place = pid ? byKey.get(`CUL-${pid}`) : null;
    let how = place ? 'id' : '';
    const knownVenue = pid ? venues.byId.get(pid) : null;
    if (!place && !knownVenue && venueName) {
      place = only(byName.get(normName(venueName)));
      if (place) how = 'name';
    }
    if (how === 'id') stat.byId += 1;
    else if (how === 'name') stat.byName += 1;

    const extra = {};
    if (t) {
      extra.prg_nm = t.prg_nm;
      extra.prg_cd = t.prg_cd;
    }
    if (d)
      for (const c of [
        'rating',
        'runtime',
        'enterprise',
        'casting',
        'crew',
        'original',
        'avg_star',
      ]) {
        const v = freeText(d[c]);
        if (v && v !== '-') extra[c] = v;
      }
    if (how === 'name') extra.place_match_by = 'name';
    if (pid) extra.place_id_raw = pid;
    if (t?.op_at) extra.op_at = t.op_at;

    const price = d ? freeText(d.price) : '';
    const row = {
      event_id: `${genre}-${resNo}`,
      genre,
      res_no: resNo,
      title: freeText(e.title),
      place_id: place?.place_key ?? '',
      place_name_raw: name ?? '',
      place_match: place ? 'matched' : 'failed',
      start_date: start,
      end_date: end,
      is_free: freeFlag(text(e.pay_at) ?? '', price),
      price_raw: price,
      showtime_raw: d ? freeText(d.showtime) : '',
      detail_url: text(d?.dabom_url) ?? text(t?.dabom_url) ?? '',
      collected_at: today,
      extra_json: Object.keys(extra).length ? JSON.stringify(extra) : '',
    };
    rows.push({ row, detail: d });

    if (!place) {
      stat.unmatched += 1;
      const venue = knownVenue ?? (venueName ? only(venues.byName.get(normName(venueName))) : null);
      const key = pid ? `CUL-${pid}` : `name:${normName(venueName) || '(없음)'}`;
      const cur = unmatched.get(key) ?? {
        key,
        name: venue?.name ?? venueName ?? '(장소명 없음)',
        reason: unmatchedReason(venue, venueName),
        events: [],
      };
      cur.events.push(row.event_id);
      unmatched.set(key, cur);
    }
  }
  return { rows, unmatched: [...unmatched.values()], stat };
}
