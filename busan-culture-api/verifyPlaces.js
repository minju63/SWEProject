// verifyPlaces.js (v2)
// 정제된 대상지역 장소(data/clean/places.json)를 카카오 API로 교차검증한다.
// 1) 주소 -> 좌표 (실패하면 장소명 키워드 검색)
// 2) 원본 좌표 -> 주소/구 (좌표가 실제로 그 구에 있는지)
// 3) 원본 좌표와 카카오 좌표의 거리 비교 (카카오 결과가 번지까지 정확할 때만)
// 결과: data/clean/places_verified.json
//
// 상태: verified / coord_only / review / fixed / replaced / manual

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CLEAN_DIR = path.join(__dirname, 'data', 'clean');
const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const MAX_DIST_M = 300; // 원본 좌표와 카카오 좌표의 허용 거리(m)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 카카오 호출 ----------
let apiErrors = 0;
let firstError = null;

async function kakao(pathname, params) {
  try {
    const res = await axios.get(`https://dapi.kakao.com/v2/local/${pathname}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      params,
      timeout: 8000,
    });
    return res.data.documents || [];
  } catch (e) {
    apiErrors++;
    if (!firstError) firstError = `${e.response ? e.response.status : e.code || ''} ${JSON.stringify(e.response ? e.response.data : e.message)}`;
    return [];
  }
}

// "부산 부산진구 초읍동 ..." -> "부산진구"
const guOf = (addrName) => (addrName ? addrName.split(/\s+/)[1] || null : null);

// 주소 뒤의 층/호/괄호 정보를 떼고, 보이지 않는 문자를 제거하고, 도로명과 번호를 띄운다
function cleanAddr(addr) {
  if (!addr) return null;
  return addr
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[,(].*$/, '')
    .replace(/\s+(B?\d+층|지하\d*층|\d+호).*$/, '')
    .replace(/([가-힣](?:로|길))(\d+)(?!\d*번?길)/g, '$1 $2') // "서면문화로14" -> "서면문화로 14"
    .trim();
}

async function geocodeAddress(query) {
  const docs = await kakao('search/address.json', { query });
  const d = docs[0];
  if (!d) return null;
  const type = d.address_type || ''; // REGION, ROAD, REGION_ADDR, ROAD_ADDR
  return {
    lat: Number(d.y),
    lng: Number(d.x),
    addr: d.road_address ? d.road_address.address_name : d.address_name,
    region: guOf(d.address_name),
    kakaoPlaceId: null,
    source: 'address',
    precise: type ? type.endsWith('_ADDR') : true, // 동/도로명만 있는 결과는 부정확
  };
}

async function keywordDocs(p, size) {
  return kakao('search/keyword.json', { query: `부산 ${p.district} ${p.name}`, size });
}

function fromKeywordDoc(d) {
  return {
    lat: Number(d.y),
    lng: Number(d.x),
    addr: d.road_address_name || d.address_name,
    region: guOf(d.address_name),
    kakaoPlaceId: d.id,
    source: 'keyword',
    precise: true,
  };
}

// 좌표 -> 주소/구
async function coordToAddr(lat, lng) {
  const docs = await kakao('geo/coord2address.json', { x: lng, y: lat });
  const d = docs[0];
  if (!d) return null;
  const jibun = d.address ? d.address.address_name : null;
  const road = d.road_address ? d.road_address.address_name : null;
  const region = d.address ? d.address.region_2depth_name : guOf(road);
  return { addr: road || jibun, region: region || null };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ---------- 메인 ----------
async function main() {
  if (!KAKAO_KEY) {
    console.log('KAKAO_REST_KEY를 읽지 못했습니다. 프로젝트 폴더의 .env를 확인하세요.');
    return;
  }

  const places = JSON.parse(fs.readFileSync(path.join(CLEAN_DIR, 'places.json'), 'utf-8'));
  const events = JSON.parse(fs.readFileSync(path.join(CLEAN_DIR, 'events.json'), 'utf-8'));
  const eventPlaceIds = new Set(events.map((e) => e.place_id));

  const results = [];
  for (const p of places) {
    // 1. 카카오 좌표 (주소 우선, 실패하면 키워드)
    const q = cleanAddr(p.addr);
    let kk = q ? await geocodeAddress(q) : null;
    await sleep(120);
    if (!kk) {
      const docs = await keywordDocs(p, 1);
      kk = docs[0] ? fromKeywordDoc(docs[0]) : null;
      await sleep(120);
    }

    // 2. 원본 좌표가 있으면 그 좌표의 구 확인
    let src = null;
    if (p.lat !== null) {
      src = await coordToAddr(p.lat, p.lng);
      await sleep(120);
    }

    // 3. 거리 (카카오 결과가 정확한 경우에만 의미가 있다)
    const dist = p.lat !== null && kk && kk.precise ? haversine(p.lat, p.lng, kk.lat, kk.lng) : null;
    const srcRegionOk = src && src.region ? src.region === p.district : null; // null = 확인 불가
    const kkRegionOk = kk ? kk.region === p.district : false;

    // 4. 상태 판정
    let status;
    let final = null; // { lat, lng, source }
    const asSource = { lat: p.lat, lng: p.lng, source: 'data.go.kr' };
    const asKakao = kk ? { lat: kk.lat, lng: kk.lng, source: 'kakao' } : null;

    if (p.lat !== null) {
      if (srcRegionOk === false) {
        // 원본 좌표가 다른 구에 찍혀 있음 -> 명백한 오류
        if (kk && kkRegionOk && kk.precise) {
          status = 'replaced';
          final = asKakao;
        } else {
          status = 'manual';
        }
      } else if (dist !== null) {
        status = dist <= MAX_DIST_M ? 'verified' : 'review'; // 구는 맞는데 거리만 다름 -> 원본 유지, 확인 필요
        final = asSource;
      } else {
        status = 'coord_only'; // 카카오로 비교 못함, 좌표의 구만 확인
        final = asSource;
      }
    } else if (kk && kkRegionOk && kk.precise) {
      status = 'fixed';
      final = asKakao;
    } else {
      status = 'manual';
    }

    // 5. 확정 안 된 곳은 키워드 검색 후보 3개를 함께 저장
    let alternatives = [];
    if (status !== 'verified' && status !== 'fixed' && (!kk || kk.source !== 'keyword')) {
      const docs = await keywordDocs(p, 3);
      alternatives = docs.map((d) => ({
        name: d.place_name,
        addr: d.road_address_name || d.address_name,
        lat: Number(d.y),
        lng: Number(d.x),
        dist_from_source: p.lat !== null ? haversine(p.lat, p.lng, Number(d.y), Number(d.x)) : null,
      }));
      await sleep(120);
    }

    results.push({
      ...p,
      verify_status: status,
      final_lat: final ? final.lat : null,
      final_lng: final ? final.lng : null,
      final_source: final ? final.source : null,
      kakao_lat: kk ? kk.lat : null,
      kakao_lng: kk ? kk.lng : null,
      kakao_addr: kk ? kk.addr : null,
      kakao_place_id: kk ? kk.kakaoPlaceId : null,
      kakao_source: kk ? kk.source : null,
      kakao_precise: kk ? kk.precise : null,
      distance_m: dist,
      src_region: src ? src.region : null,
      addr_from_coord: !p.addr && src ? src.addr : null,
      alternatives,
    });
    process.stdout.write('.');
  }
  console.log('');

  fs.writeFileSync(path.join(CLEAN_DIR, 'places_verified.json'), JSON.stringify(results, null, 2), 'utf-8');

  // ---------- 리포트 ----------
  console.log(`\n카카오 API 오류: ${apiErrors}건${firstError ? ` (첫 오류: ${firstError})` : ''}`);

  const count = {};
  for (const r of results) count[r.verify_status] = (count[r.verify_status] || 0) + 1;
  console.log('\n========== 전체 상태 ==========');
  console.log(count);

  const evPlaces = results.filter((r) => eventPlaceIds.has(r.place_id));
  const evCount = {};
  for (const r of evPlaces) evCount[r.verify_status] = (evCount[r.verify_status] || 0) + 1;
  console.log(`\n========== 이벤트가 연결된 장소 ${evPlaces.length}곳 ==========`);
  console.log(evCount);

  console.log('\n========== verified 아닌 장소 ==========');
  for (const r of results.filter((x) => x.verify_status !== 'verified')) {
    const ev = eventPlaceIds.has(r.place_id) ? ' [이벤트있음]' : '';
    console.log(`- [${r.verify_status}]${ev} ${r.place_id} ${r.name} / ${r.district}`);
    console.log(`    원본: (${r.lat}, ${r.lng}) 원본좌표의 구: ${r.src_region} / 주소: ${r.addr || '없음'}`);
    console.log(`    카카오(${r.kakao_source || '없음'}, 정확도 ${r.kakao_precise}): (${r.kakao_lat}, ${r.kakao_lng}) ${r.kakao_addr || ''} / 거리 ${r.distance_m}m`);
    if (r.addr_from_coord) console.log(`    좌표로 찾은 주소: ${r.addr_from_coord}`);
    for (const a of r.alternatives) {
      console.log(`    후보: ${a.name} / ${a.addr} / (${a.lat}, ${a.lng}) / 원본과 ${a.dist_from_source}m`);
    }
  }

  console.log('\n저장 완료: data/clean/places_verified.json');
}

main();