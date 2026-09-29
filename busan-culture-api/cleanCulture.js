// cleanCulture.js
// 1차 정제: 사하구/부산진구 장소 + 현재/예정 이벤트를 뽑아서 data/clean/ 에 저장한다.
// district는 원본 sigungu가 아니라 addr에서 파싱한 값을 우선 사용한다.
// coord_status 'ok' = 로컬 규칙 통과일 뿐, 카카오 교차검증(verifyPlaces.js) 전까지는 검증 완료가 아니다.

const fs = require('fs');
const path = require('path');

const LIST_DIR = path.join(__dirname, 'data', 'list');
const CLEAN_DIR = path.join(__dirname, 'data', 'clean');
const TARGET_GUGUN = ['사하구', '부산진구'];
const BUSAN_DISTRICTS = ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'];

// 오늘 날짜 (로컬 날짜, YYYY-MM-DD)
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// ---------- 공통 함수 ----------
function loadJson(name) {
  const json = JSON.parse(fs.readFileSync(path.join(LIST_DIR, name), 'utf-8'));
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.list)) return json.list;
  throw new Error(`${name} 구조 확인 필요 (배열 아님)`);
}

// null, undefined, "", "null" 문자열 -> null 로 통일
function clean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' || t.toLowerCase() === 'null' ? null : t;
  }
  return v;
}

function toNum(v) {
  const c = clean(v);
  if (c === null) return null;
  const n = Number(c);
  return Number.isNaN(n) ? null : n;
}

const inLat = (x) => x >= 34.8 && x <= 35.5;
const inLng = (x) => x >= 128.7 && x <= 129.3;

// 좌표 검사: { lat, lng, status, reason } 반환
function checkCoord(lat, lng) {
  if (lat === null || lng === null) return { lat: null, lng: null, status: 'needs_fix', reason: '좌표없음' };
  if (lat === lng) return { lat: null, lng: null, status: 'needs_fix', reason: '위경도같음' };
  if (inLat(lat) && inLng(lng)) return { lat, lng, status: 'ok', reason: null };
  if (inLat(lng) && inLng(lat)) return { lat: lng, lng: lat, status: 'ok', reason: '위경도순서바뀜_자동교정' };
  return { lat: null, lng: null, status: 'needs_fix', reason: '범위이상' };
}

// 주소에서 "부산 ○○구/군" 파싱 (예: "부산광역시 해운대구 ..." -> "해운대구")
// 부산 16개 구·군에 없는 값이면 파싱 실패(null)로 처리한다.
function parseDistrict(addr) {
  if (!addr) return null;
  const m = addr.match(/부산(?:광역시)?\s+([가-힣]+[구군])/);
  if (!m) return null;
  let d = m[1];
  if (d === '진구') d = '부산진구'; // "부산광역시 진구" 오기재 보정
  return BUSAN_DISTRICTS.includes(d) ? d : null;
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- 메인 ----------
function main() {
  fs.mkdirSync(CLEAN_DIR, { recursive: true });

  const rawPlaces = loadJson('performPlace.json'); // 전시공간(exhibitPlace)은 동일 데이터라 제외
  const rawEvents = loadJson('theme.json');
  const rawThemeCodes = loadJson('themeCode.json');

  // 테마 코드 사전 (숫자로 정규화)
  const themeMap = new Map();
  for (const t of rawThemeCodes) themeMap.set(Number(t.theme), clean(t.theme_nm));

  // 1. 장소 전체(606곳) 정제 + district 정정
  const allPlaces = rawPlaces.map((p) => {
    const addr = clean(p.addr);
    const sigungu = clean(p.sigungu);
    const addrDistrict = parseDistrict(addr);
    const district = addrDistrict || sigungu;
    const srcLat = toNum(p.lttd);
    const srcLng = toNum(p.lngt);
    const c = checkCoord(srcLat, srcLng);
    return {
      place_id: clean(p.placeId),
      name: clean(p.placeNm),
      district,
      district_sigungu: sigungu,
      district_source: addrDistrict ? 'addr' : 'sigungu',
      district_conflict: !!(addrDistrict && sigungu && addrDistrict !== sigungu),
      addr,
      addr_missing: addr === null,
      addr_unparsed: addr !== null && addrDistrict === null,
      tel: clean(p.tel),
      url: clean(p.url),
      rent_yn: clean(p.rent_yn),
      rent_url: clean(p.rent_url),
      genre: clean(p.attr_genre),
      public_type: clean(p.attr_pbl),
      open_year: toNum(p.openYear),
      seat_cnt: toNum(p.seatCnt),
      place_cnt: toNum(p.placeCnt),
      source_lat: srcLat,
      source_lng: srcLng,
      lat: c.lat,
      lng: c.lng,
      coord_status: c.status,
      coord_reason: c.reason,
      coord_source: 'data.go.kr',
      kakao_place_id: null,
      active: true,
    };
  });
  const allPlaceMap = new Map(allPlaces.map((p) => [p.place_id, p]));

  // 2. sigungu vs 주소 구 충돌 리포트 (전체 기준)
  const conflicts = allPlaces.filter((p) => p.district_conflict);
  const removed = conflicts.filter((p) => TARGET_GUGUN.includes(p.district_sigungu) && !TARGET_GUGUN.includes(p.district));
  const added = conflicts.filter((p) => !TARGET_GUGUN.includes(p.district_sigungu) && TARGET_GUGUN.includes(p.district));
  const otherConflicts = conflicts.filter((p) => !removed.includes(p) && !added.includes(p));

  // 3. 대상지역 필터는 정정된 district 기준
  const places = allPlaces.filter((p) => TARGET_GUGUN.includes(p.district));
  const placeMap = new Map(places.map((p) => [p.place_id, p]));

  // 4. 이벤트 정제 (현재/예정 + 대상지역 장소에 연결되는 것만)
  const seen = new Set();
  let dupCount = 0;
  const badDateEvents = [];
  const unmappedThemes = new Set();
  const events = [];

  for (const e of rawEvents) {
    const start = clean(e.op_st_dt);
    const end = clean(e.op_ed_dt);
    if (!isDate(end) || !isDate(start)) {
      badDateEvents.push(e);
      continue;
    }
    if (end < TODAY) continue;

    const placeId = clean(e.place_id);
    const place = placeMap.get(placeId);
    if (!place) continue;

    const key = `${clean(e.res_no)}_${placeId}`;
    if (seen.has(key)) {
      dupCount++;
      continue;
    }
    seen.add(key);

    const codes = (clean(e.theme) || '').split(',').map((s) => s.trim()).filter(Boolean);
    const names = codes.map((c) => {
      const n = themeMap.get(Number(c));
      if (!n) unmappedThemes.add(c);
      return n || null;
    });

    events.push({
      event_id: clean(e.res_no),
      title: clean(e.title),
      category: clean(e.prg_nm),
      category_code: clean(e.prg_cd),
      start_date: start,
      end_date: end,
      op_at: clean(e.op_at),
      pay_at: clean(e.pay_at),
      place_id: placeId,
      place_name: place.name,
      district: place.district,
      url: clean(e.dabom_url),
      theme_codes: codes,
      theme_names: names.filter(Boolean),
      active: true,
    });
  }

  // 5. 저장
  fs.writeFileSync(path.join(CLEAN_DIR, 'places.json'), JSON.stringify(places, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CLEAN_DIR, 'events.json'), JSON.stringify(events, null, 2), 'utf-8');

  // 6. 리포트
  console.log(`오늘: ${TODAY}\n`);
  console.log('========== 구 정정 (sigungu vs 주소) ==========');
  console.log(`전체 ${allPlaces.length}곳 중 충돌 ${conflicts.length}곳`);
  console.log(`\n[대상지역에서 제외됨 ${removed.length}곳]`);
  for (const p of removed) console.log(`- [${p.place_id}] ${p.name} / sigungu=${p.district_sigungu} → 주소구=${p.district} / ${p.addr}`);
  console.log(`\n[대상지역에 추가됨 ${added.length}곳]`);
  for (const p of added) console.log(`- [${p.place_id}] ${p.name} / sigungu=${p.district_sigungu} → 주소구=${p.district} / ${p.addr}`);
  console.log(`\n[대상지역과 무관한 충돌 ${otherConflicts.length}곳]`);
  for (const p of otherConflicts) console.log(`- [${p.place_id}] ${p.name} / sigungu=${p.district_sigungu} → 주소구=${p.district}`);

  const unparsed = allPlaces.filter((p) => p.addr_unparsed);
  console.log(`\n[주소는 있는데 구 파싱 실패 ${unparsed.length}곳 - sigungu로 대체됨]`);
  for (const p of unparsed) console.log(`- [${p.place_id}] ${p.name} / sigungu=${p.district_sigungu} / ${p.addr}`);

  console.log('\n========== 장소 ==========');
  console.log(`대상지역 장소: ${places.length}곳`);
  const statusCount = {};
  for (const p of places) statusCount[p.coord_status] = (statusCount[p.coord_status] || 0) + 1;
  console.log('좌표 상태:', statusCount);
  console.log(`자동교정(순서바뀜): ${places.filter((p) => p.coord_reason === '위경도순서바뀜_자동교정').length}곳`);

  const noAddr = places.filter((p) => p.addr_missing);
  console.log(`\n[대상지역 중 주소 없음 ${noAddr.length}곳]`);
  for (const p of noAddr) console.log(`- [${p.place_id}] ${p.name} / ${p.district} / 좌표(${p.lat}, ${p.lng})`);

  const bad = places.filter((p) => p.coord_status === 'needs_fix');
  console.log(`\n[needs_fix ${bad.length}곳]`);
  for (const p of bad) {
    console.log(`- [${p.place_id}] ${p.name} / ${p.district} / ${p.coord_reason} / 원본(${p.source_lat}, ${p.source_lng}) / 주소: ${p.addr || '없음'}`);
  }

  console.log('\n========== 이벤트 ==========');
  console.log(`현재/예정 + 대상지역: ${events.length}건`);
  const byDistrict = {};
  const byCategory = {};
  for (const e of events) {
    byDistrict[e.district] = (byDistrict[e.district] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }
  console.log('구별:', byDistrict);
  console.log('장르별:', byCategory);
  console.log(`중복 제거: ${dupCount}건`);
  console.log(`테마코드 사전에 없는 코드: ${unmappedThemes.size}개`, unmappedThemes.size ? [...unmappedThemes] : '');

  console.log(`\n[날짜 이상 이벤트 ${badDateEvents.length}건 - 정제에서 제외됨]`);
  for (const e of badDateEvents) {
    const pl = allPlaceMap.get(clean(e.place_id));
    const where = pl ? `${pl.district}` : '장소불명';
    console.log(`- [${clean(e.place_id)}] ${clean(e.place_nm)} (${where}) / ${clean(e.op_st_dt)} ~ ${clean(e.op_ed_dt)} / ${clean(e.title)}`);
  }

  console.log('\n[이벤트 목록]');
  for (const e of events) {
    console.log(`- ${e.end_date} 종료 / ${e.district} / ${e.place_name} / ${e.title}`);
  }

  console.log('\n저장 완료: data/clean/places.json, data/clean/events.json');
}

main();