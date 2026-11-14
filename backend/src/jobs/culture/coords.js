/*
 * 장소 좌표 검증·보정 (SRS FR-MAP-030, DP-MAP-03, NFR-MAP-020·025, UC-MAP-008 5단계)
 *   1. 주소를 행안부 도로명주소 검색 API(DORO_KEY)로 찾는다. 검색어와 정확히 같은 주소 후보만 센다.
 *   2. 후보가 1건이면 행정코드로 좌표제공 API(COORDINATE_KEY)를 불러 UTM-K 좌표를 WGS84 위경도로 바꾼다.
 *   3. 판정 (DP-MAP-03 (3)(4) 그대로)
 *        원본 좌표를 쓸 수 있고 행안부 좌표가 있음: 거리 300m 이내 verified, 넘으면 review
 *        원본 좌표를 쓸 수 없고 행안부 좌표가 있음: fixed (lat·lng 를 행안부 좌표로, coord_source mois_juso)
 *        후보가 2건 이상: review / 행안부 좌표 없음: 원본이 있으면 coord_only, 없으면 missing
 *      fixed 가 아니면 lat·lng 는 쓸 수 있는 원본 좌표, 없으면 빈 값이다. review·missing 은 지도에 나오지 않는다(FR-MAP-001).
 * 행안부 좌표는 fixed 장소의 lat·lng 로만 저장하고 그 밖에는 거리 계산에만 쓴다. 행정코드는 저장하지 않는다.
 * 좌표 값은 로그·보고에 남기지 않는다. 행안부 API 가 오류를 내면 이번 검증을 건너뛰고 기존 값을 둔다 (5C).
 */
import { sleep } from './dataGoKr.js';
import { text } from './normalize.js';

const JUSO_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const COORD_URL = 'https://business.juso.go.kr/addrlink/addrCoordApi.do';
const THRESHOLD_M = 300;
const ERROR_LIMIT = 0.1; // 호출 30번 이후 오류율 10% 를 넘으면 이번 검증을 버린다
const TIMEOUT_MS = 10000;

class StopVerify extends Error {}

const keys = () => ({ juso: process.env.DORO_KEY ?? '', coord: process.env.COORDINATE_KEY ?? '' });
const mask = (s) =>
  Object.values(keys())
    .filter(Boolean)
    .reduce((out, k) => out.split(k).join('***'), String(s));

// 부산 범위 안의 정상 좌표인지
export const usable = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= 34.8 &&
  lat <= 35.45 &&
  lng >= 128.7 &&
  lng <= 129.35 &&
  lat !== lng;

function distanceM(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((la2 - la1) * r) / 2) ** 2 +
    Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

// EPSG:5179(UTM-K, GRS80) → WGS84 위경도. TM 역변환 (Snyder)
function utmkToLatLng(x, y) {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const lat0 = (38 * Math.PI) / 180;
  const lon0 = (127.5 * Math.PI) / 180;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const M = (p) =>
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const mu =
    (M(lat0) + (y - 2000000) / k0) / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1);
  const c = Math.cos(p1);
  const t = Math.tan(p1);
  const C1 = ep2 * c * c;
  const T1 = t * t;
  const N1 = a / Math.sqrt(1 - e2 * s * s);
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * s * s, 1.5);
  const D = (x - 1000000) / (N1 * k0);
  const lat =
    p1 -
    ((N1 * t) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      c;
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

// 주소 → 도로명주소 검색어 (괄호·층·호를 자르고 '부산광역시 구'를 맞춘다. 처음 정제 jusoApi.js 와 같은 규칙)
export function refineAddress(addr, district) {
  let q = text(addr);
  if (!q) return null;
  q = q
    .replace(/[,(].*$/, '')
    .replace(/[%=<>[\]]/g, ' ')
    .replace(/\s+(B?\d+층|지하\d*층|\d+호).*$/, '')
    .replace(/([가-힣](?:로|길))(\d+)(?!\d*번?길)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return null;
  q = q
    .replace(/^부산(?:시)?(?=\s)/, '부산광역시')
    .replace(/^부산광역시\s+진구(?=\s|$)/, '부산광역시 부산진구')
    .replace(/\s[가-힣\d]+(?:동|가|리)(?=\s+[가-힣\d]+(?:로|길)\s*\d)/, '');
  const road = q.match(/^(.*?[가-힣\d]+(?:로|길)\s*\d+(?:-\d+)?)(?=\s|$)/);
  const jibun = road ? null : q.match(/^(.*?[가-힣]+(?:동|리|가)\s*\d+(?:-\d+)?)(?=\s|$)/);
  if (road) q = road[1];
  else if (jibun) q = jibun[1];
  if (!/^부산광역시/.test(q)) {
    if (/^[가-힣]+[구군](?=\s)/.test(q)) q = `부산광역시 ${q}`;
    else if (district) q = `부산광역시 ${district} ${q}`;
  }
  return q;
}

// 검색어가 번지로 끝나면 검색어와 정확히 같은 주소만 후보로 센다 (부분 일치 결과 배제)
const squash = (s) => String(s ?? '').replace(/\s/g, '');
function candidates(items, district, keyword) {
  let list = items
    .filter((x) => /^부산/.test(x.siNm ?? ''))
    .filter((x) => !district || x.sggNm === district);
  if (/\d$/.test(keyword)) {
    const k = squash(keyword);
    list = list.filter(
      (x) =>
        squash(x.roadAddr.replace(/\s*\([^)]*\)\s*$/, '')) === k ||
        (squash(x.jibunAddr).startsWith(k) && !/^[\d-]/.test(squash(x.jibunAddr).slice(k.length)))
    );
  }
  return list;
}

// 행안부 API 호출. 속도 제한(E0007)은 쉬었다가 다시, 키 문제는 검증 전체를 멈춘다
async function callJuso(url, params, state) {
  for (let attempt = 0; ; attempt++) {
    state.calls += 1;
    let body;
    try {
      const res = await fetch(`${url}?${new URLSearchParams({ ...params, resultType: 'json' })}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if ([401, 403, 429].includes(res.status)) throw new StopVerify(`행안부 HTTP ${res.status}`);
      body = (await res.json()).results;
    } catch (e) {
      if (e instanceof StopVerify) throw e;
      state.errors += 1;
      return null;
    } finally {
      await sleep(state.pace);
    }
    const code = String(body?.common?.errorCode ?? '');
    if (code === 'E0007' && attempt < 5) {
      state.pace = Math.min(state.pace * 2, 4000);
      await sleep(Math.min(3000 * 2 ** attempt, 30000));
      continue;
    }
    if (code === 'E0001') throw new StopVerify('행안부 승인키 오류 E0001');
    if (code !== '0') {
      state.errors += 1;
      return null;
    }
    state.pace = Math.max(300, Math.round(state.pace * 0.85));
    return body;
  }
}

async function moisCoord(address, district, state) {
  const keyword = refineAddress(address, district);
  if (!keyword) return { verdict: 'noaddr' };
  const found = await callJuso(
    JUSO_URL,
    { confmKey: keys().juso, currentPage: 1, countPerPage: 10, keyword },
    state
  );
  if (!found) return { verdict: 'error' };
  const juso = Array.isArray(found.juso) ? found.juso : found.juso ? [found.juso] : [];
  const list = candidates(juso, district, keyword);
  if (list.length > 1) return { verdict: 'multiple' };
  if (!list.length) return { verdict: 'none' };
  const hit = list[0];
  const coord = await callJuso(
    COORD_URL,
    {
      confmKey: keys().coord,
      admCd: hit.admCd,
      rnMgtSn: hit.rnMgtSn,
      udrtYn: hit.udrtYn,
      buldMnnm: hit.buldMnnm,
      buldSlno: hit.buldSlno,
    },
    state
  );
  const j = Array.isArray(coord?.juso) ? coord.juso[0] : coord?.juso;
  const x = Number(j?.entX);
  const y = Number(j?.entY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { verdict: coord ? 'none' : 'error' };
  const [lat, lng] = utmkToLatLng(x, y);
  return usable(lat, lng) ? { verdict: 'unique', lat, lng } : { verdict: 'none' };
}

function judge(place, mois) {
  const srcOk = usable(Number(place.lat_src), Number(place.lng_src));
  // fixed 가 아니면 lat·lng 는 원본 좌표 그대로 (쓸 수 없으면 빈 값)
  const src = srcOk
    ? { lat: Number(place.lat_src), lng: Number(place.lng_src) }
    : { lat: null, lng: null };
  if (mois.lat !== undefined) {
    if (!srcOk)
      return {
        coord_status: 'fixed',
        coord_source: 'mois_juso',
        coord_distance_m: null,
        lat: mois.lat,
        lng: mois.lng,
      };
    const d = Math.round(
      distanceM(Number(place.lat_src), Number(place.lng_src), mois.lat, mois.lng)
    );
    return {
      coord_status: d <= THRESHOLD_M ? 'verified' : 'review',
      coord_source: 'source',
      coord_distance_m: d,
      ...src,
      reason:
        d <= THRESHOLD_M ? null : `원본 좌표와 행안부 좌표가 ${d}m 차이 (기준 ${THRESHOLD_M}m)`,
    };
  }
  if (mois.verdict === 'multiple')
    return {
      coord_status: 'review',
      coord_source: srcOk ? 'source' : null,
      coord_distance_m: null,
      ...src,
      reason: '주소와 일치하는 행안부 후보가 2건 이상',
    };
  return srcOk
    ? { coord_status: 'coord_only', coord_source: 'source', coord_distance_m: null, ...src }
    : { coord_status: 'missing', coord_source: null, coord_distance_m: null, ...src };
}

const sameCoord = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-7;

/*
 * places: [{ place_id, place_key, name, address, district, lat, lng, lat_src, lng_src, coord_status, coord_source, coord_distance_m }]
 * → { updates: [{ place_id, place_key, name, changes }], issues, error, checked, changedStatus }
 * error 가 있으면 updates 는 비어 있다 (이번 검증을 쓰지 않는다)
 */
export async function verifyCoords(places, log = () => {}) {
  if (!keys().juso || !keys().coord)
    return {
      updates: [],
      issues: [],
      checked: 0,
      error: 'backend/.env 에 DORO_KEY 또는 COORDINATE_KEY 가 없어 좌표 검증을 건너뜀',
    };
  const state = { calls: 0, errors: 0, pace: 300 };
  const results = [];
  try {
    for (const place of places) {
      const mois = await moisCoord(place.address, place.district, state);
      if (mois.verdict === 'error') {
        results.push(null); // 이 장소는 이번에 판정하지 않는다
      } else results.push(judge(place, mois));
      if (state.calls >= 30 && state.errors / state.calls > ERROR_LIMIT)
        throw new StopVerify(
          `행안부 API 오류율 ${Math.round((state.errors / state.calls) * 100)}% (기준 10%)`
        );
    }
  } catch (e) {
    return {
      updates: [],
      issues: [],
      checked: 0,
      error: `좌표 검증 중단: ${mask(e.message)} (기존 좌표 유지)`,
    };
  }
  log(`  좌표 검증 ${places.length}곳, 행안부 호출 ${state.calls}회, 오류 ${state.errors}회`);

  const updates = [];
  const issues = [];
  places.forEach((place, i) => {
    const r = results[i];
    if (!r) return;
    const changes = {};
    for (const k of ['coord_status', 'coord_source', 'coord_distance_m'])
      if ((place[k] ?? null) !== (r[k] ?? null)) changes[k] = r[k] ?? null;
    const sameLatLng =
      r.lat == null
        ? place.lat == null && place.lng == null
        : sameCoord(place.lat, r.lat) && sameCoord(place.lng, r.lng);
    if (!sameLatLng) {
      changes.lat = r.lat;
      changes.lng = r.lng;
    }
    if (Object.keys(changes).length)
      updates.push({
        place_id: place.place_id,
        place_key: place.place_key,
        name: place.name,
        changes,
      });
    if (r.coord_status === 'review')
      issues.push({
        issue_type: 'coord_review',
        ref_type: 'place',
        ref_key: place.place_key,
        place_id: place.place_id,
        name: place.name,
        detail: r.reason,
      });
  });
  return { updates, issues, checked: results.filter(Boolean).length, error: null };
}
