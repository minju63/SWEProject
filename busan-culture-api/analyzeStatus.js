// analyzeStatus.js
// data/list 안의 모든 json을 자동으로 읽어서 종류를 판별하고
// 현재 프로젝트 전체 상태를 한 번에 출력한다.

const fs = require('fs');
const path = require('path');

const LIST_DIR = path.join(__dirname, 'data', 'list');
const TARGET_GUGUN = ['사하구', '부산진구'];
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function checkCoord(p) {
  const issues = [];
  if (p.lttd == null || p.lttd === '') issues.push('위도없음');
  if (p.lngt == null || p.lngt === '') issues.push('경도없음');
  if (typeof p.lttd === 'number' && (p.lttd < 34.8 || p.lttd > 35.5)) issues.push('위도범위이상');
  if (typeof p.lngt === 'number' && (p.lngt < 128.7 || p.lngt > 129.3)) issues.push('경도범위이상');
  if (p.lttd != null && p.lttd === p.lngt) issues.push('위도경도같음');
  if (!p.addr) issues.push('주소없음');
  return issues;
}

function loadJson(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.log(`[경고] ${path.basename(file)} 파싱 실패: ${e.message}`);
    return null;
  }
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.list)) return json.list;
  console.log(`[경고] ${path.basename(file)} 최상위 구조가 배열이 아님 (키: ${Object.keys(json).join(', ')})`);
  return null;
}

function detectType(items) {
  if (!items || items.length === 0) return 'empty';
  const keys = Object.keys(items[0]);
  if (keys.includes('placeId') && keys.includes('lttd')) return 'place';
  if (keys.includes('place_id') && keys.includes('theme')) return 'theme';
  if (keys.includes('theme_nm')) return 'themeCode';
  if (keys.includes('gugun') && keys.includes('program_nm')) return 'cultureDay';
  if (keys.includes('op_st_dt') && keys.includes('place_nm')) return 'event';
  return 'unknown';
}

function main() {
  if (!fs.existsSync(LIST_DIR)) {
    console.log(`data/list 폴더를 찾을 수 없습니다: ${LIST_DIR}`);
    return;
  }
  const files = fs.readdirSync(LIST_DIR).filter(f => f.endsWith('.json'));
  console.log(`총 ${files.length}개 JSON 파일 발견\n`);

  const places = [];
  const events = [];
  let themeItems = [];

  for (const file of files) {
    const items = loadJson(path.join(LIST_DIR, file));
    if (!items) continue;
    const type = detectType(items);
    console.log(`- ${file}: ${items.length}건 (${type})`);

    if (type === 'place') places.push({ file, items });
    else if (type === 'theme') themeItems = items;
    else if (type === 'event') events.push({ file, items });
  }

  console.log('\n========== 장소(place) 데이터 ==========');
  const placeMap = new Map();
  for (const { file, items } of places) {
    let target = 0;
    const coordIssueCount = {};
    for (const p of items) {
      if (TARGET_GUGUN.includes(p.sigungu)) target++;
      for (const issue of checkCoord(p)) {
        coordIssueCount[issue] = (coordIssueCount[issue] || 0) + 1;
      }
      placeMap.set(p.placeId, p);
    }
    console.log(`${file}: 전체 ${items.length} / 대상지역(사하구+부산진구) ${target}`);
    console.log(`  좌표 이상:`, coordIssueCount);
  }

  if (places.length === 2) {
    const idsA = new Set(places[0].items.map(p => p.placeId));
    const idsB = new Set(places[1].items.map(p => p.placeId));
    let overlap = 0;
    for (const id of idsA) if (idsB.has(id)) overlap++;
    console.log(`\n${places[0].file}(${idsA.size}건) vs ${places[1].file}(${idsB.size}건) placeId 겹침: ${overlap}건`);
    if (overlap === idsA.size && idsA.size === idsB.size) {
      console.log('→ 두 파일이 완전히 동일한 장소 목록입니다.');
    } else if (overlap > 0) {
      console.log('→ 일부만 겹칩니다.');
    } else {
      console.log('→ 겹치는 placeId 없음, 별개의 장소 목록입니다.');
    }
  }
  console.log(`\n전체 고유 장소 수(placeId 기준): ${placeMap.size}`);

  console.log('\n========== 이벤트(theme.json) 데이터 ==========');
  let unmatchedCurrent = [];
  if (themeItems.length > 0) {
    const current = themeItems.filter(e => e.op_ed_dt >= TODAY);
    const matched = current.filter(e => placeMap.has(e.place_id));
    unmatchedCurrent = current.filter(e => !placeMap.has(e.place_id));
    const targetCurrent = current.filter(e => {
      const place = placeMap.get(e.place_id);
      return place && TARGET_GUGUN.includes(place.sigungu);
    });
    console.log(`전체: ${themeItems.length} / 현재·예정(오늘 ${TODAY} 기준): ${current.length}`);
    console.log(`현재·예정 중 place 매칭 성공: ${matched.length} / 실패: ${unmatchedCurrent.length}`);
    console.log(`현재·예정 + 대상지역(사하구·부산진구): ${targetCurrent.length}`);
  } else {
    console.log('theme.json을 찾지 못함');
  }

  // 매칭 실패한 현재/예정 이벤트 목록 - place_nm에 대상지역 단어가 섞여있는지 체크
  console.log('\n========== 매칭 실패 이벤트 목록 (현재/예정) ==========');
  for (const e of unmatchedCurrent) {
    const guess = /사하구|부산진/.test(e.place_nm || '') ? '  <- 대상지역 의심' : '';
    console.log(`- [${e.place_id}] ${e.place_nm} / ${e.title}${guess}`);
  }

  console.log('\n========== 장르별 이벤트 파일 ==========');
  for (const { file, items } of events) {
    console.log(`${file}: ${items.length}건`);
  }
}

main();