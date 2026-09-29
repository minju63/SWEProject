// probeDetail.js
// 1) 정제된 이벤트 29건이 어느 장르 목록 파일에 속하는지 확인
// 2) 전시 상세 API를 실제 호출해서 응답 구조 확인 (res_no 있음 / 없음)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const LIST_DIR = path.join(__dirname, 'data', 'list');
const CLEAN_DIR = path.join(__dirname, 'data', 'clean');
const KEY = decodeURIComponent(process.env.API_KEY || '');

// 공식 명세(data.go.kr 15063738)에서 확인된 요청주소
const EXHIBIT_DETAIL_URL =
  'https://apis.data.go.kr/6260000/BusanCultureExhibitDetailService/getBusanCultureExhibitDetail';

const GENRE_FILES = ['classic', 'concert', 'dance', 'etc', 'exhibit', 'musical', 'opera', 'play', 'tradition'];

function loadJsonPath(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.list)) return json.list;
  throw new Error(`${file} 구조 확인 필요`);
}

// 객체 안에서 특정 키를 재귀적으로 찾는다
function findKey(obj, key) {
  if (obj === null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findKey(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

async function callApi(label, params) {
  console.log(`\n===== ${label} =====`);
  try {
    const res = await axios.get(EXHIBIT_DETAIL_URL, {
      params: { ServiceKey: KEY, ...params },
      responseType: 'text',
      timeout: 10000,
    });
    const text = res.data;
    console.log('[원본 응답 앞부분]');
    console.log(text.slice(0, 1200));
    const parsed = text.trim().startsWith('<') ? new XMLParser().parse(text) : JSON.parse(text);
    console.log('\n[파싱 결과 구조]');
    console.log(JSON.stringify(parsed, null, 2).slice(0, 2500));
    console.log(`\ntotalCount: ${findKey(parsed, 'totalCount')}`);
    return parsed;
  } catch (e) {
    console.log(`요청 실패: ${e.code || ''} ${e.message}`);
    if (e.response) console.log('상태:', e.response.status, String(e.response.data).slice(0, 500));
    return null;
  }
}

async function main() {
  if (!KEY) {
    console.log('API_KEY가 .env에 없습니다.');
    return;
  }

  // 1. 이벤트 -> 장르 목록 파일 매핑
  const events = loadJsonPath(path.join(CLEAN_DIR, 'events.json'));
  const index = new Map(); // res_no -> [파일명]
  for (const g of GENRE_FILES) {
    const file = path.join(LIST_DIR, `${g}.json`);
    if (!fs.existsSync(file)) continue;
    for (const item of loadJsonPath(file)) {
      const k = String(item.res_no);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(g);
    }
  }

  console.log('========== 이벤트 -> 장르 목록 파일 매핑 ==========');
  const summary = {};
  for (const e of events) {
    const files = index.get(String(e.event_id)) || [];
    const key = `${e.category}(${e.category_code}) -> ${files.join('+') || '어느 파일에도 없음'}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  console.log(summary);

  // 2. 전시 상세 API 실제 호출
  const target = events.find((e) => (index.get(String(e.event_id)) || []).includes('exhibit'));
  if (!target) {
    console.log('exhibit 파일에 속하는 이벤트가 없어 호출 테스트를 건너뜁니다.');
    return;
  }
  console.log(`\n테스트 대상: [${target.event_id}] ${target.title}`);
  console.log(`목록 쪽 값: pay_at=${target.pay_at}, op_at=${target.op_at}, place_id=${target.place_id}, 기간=${target.start_date}~${target.end_date}`);

  await callApi('전시 상세 (res_no 지정)', { pageNo: 1, numOfRows: 10, res_no: target.event_id });
  await callApi('전시 상세 (res_no 없이, 3건)', { pageNo: 1, numOfRows: 3 });
}

main();