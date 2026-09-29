// resolveMissingPlaces.js
const path = require('path');
// 실행 위치와 상관없이 스크립트가 있는 폴더의 .env를 명시적으로 로드합니다.
require('dotenv').config({ path: path.join(__dirname, '.env') }); 

const fs = require('fs');
const axios = require('axios');

const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const LIST_DIR = path.join(__dirname, 'data', 'list');
const TODAY = new Date().toISOString().slice(0, 10);

function loadJson(file) {
  if (!fs.existsSync(file)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${file}`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function searchKakao(query) {
  const res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    params: { query: `부산 ${query}` },
    timeout: 5000, 
  });
  return res.data.documents[0] || null;
}

async function main() {
  console.log('KAKAO_REST_KEY 로드 확인:', KAKAO_KEY ? `${KAKAO_KEY.slice(0, 4)}**** (길이 ${KAKAO_KEY.length})` : '없음!!');

  // 대환님이 원래 사용하시던 파일명으로 복구했습니다.
  const themeFile = path.join(LIST_DIR, 'theme.json');
  const placeFile = path.join(LIST_DIR, 'performPlace.json');

  const theme = loadJson(themeFile);
  const place = loadJson(placeFile);
  const placeIds = new Set(place.map(p => p.placeId));

  const current = theme.filter(e => e.op_ed_dt >= TODAY);
  const unmatched = current.filter(e => !placeIds.has(e.place_id) && e.place_nm);
  const uniqueNames = [...new Set(unmatched.map(e => e.place_nm))];

  console.log(`매칭 실패 이벤트 ${unmatched.length}건 / 고유 장소 ${uniqueNames.length}개\n`);

  for (const name of uniqueNames) {
    console.log(`검색 시작: ${name}`); 
    try {
      const result = await searchKakao(name);
      if (result) {
        console.log(`  → ${result.address_name} (${result.place_name})`);
      } else {
        console.log('  → 검색 결과 없음');
      }
    } catch (e) {
      const status = e.response ? e.response.status : '네트워크/타임아웃';
      console.log(`  → 요청 실패 (코드: ${status})`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
}

main();