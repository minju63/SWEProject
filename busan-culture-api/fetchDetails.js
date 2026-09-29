// fetchDetails.js
// 정제된 이벤트(data/clean/events.json)의 상세 정보를 장르별 상세 API로 가져온다.
// - 어떤 상세 API를 쓸지는 res_no가 들어있는 장르 목록 파일로 판별한다.
// - 요청주소 규칙: 서비스명 끝의 'Service'를 빼고 앞에 'get'을 붙인다.
//   (전시 상세는 공식 명세로 확인됨, 클래식/오페라는 같은 규칙으로 만든 주소이며 실패하면 리포트에 에러가 그대로 나온다)
// - 결과 저장: data/clean/event_details.json

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const LIST_DIR = path.join(__dirname, 'data', 'list');
const CLEAN_DIR = path.join(__dirname, 'data', 'clean');
const KEY = decodeURIComponent(process.env.API_KEY || '');
const BASE = 'https://apis.data.go.kr/6260000';

const DETAIL_SERVICES = {
  exhibit: 'BusanCultureExhibitDetailService',
  classic: 'BusanCultureClassicDetailService',
  opera: 'BusanCultureOperaDetailService',
};
const GENRE_FILES = ['classic', 'concert', 'dance', 'etc', 'exhibit', 'musical', 'opera', 'play', 'tradition'];

const parser = new XMLParser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function detailUrl(genre) {
  const svc = DETAIL_SERVICES[genre];
  return `${BASE}/${svc}/get${svc.replace(/Service$/, '')}`;
}

function loadJsonPath(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.list)) return json.list;
  throw new Error(`${file} 구조 확인 필요`);
}

// 상세 1건 조회. 실패하면 { ok: false, error } 반환
async function fetchOne(genre, resNo) {
  try {
    const res = await axios.get(detailUrl(genre), {
      params: { ServiceKey: KEY, pageNo: 1, numOfRows: 10, res_no: resNo },
      responseType: 'text',
      timeout: 10000,
    });
    const text = res.data;
    const parsed = text.trim().startsWith('<') ? parser.parse(text) : JSON.parse(text);
    const code = parsed?.response?.header?.resultCode;
    if (code === undefined || Number(code) !== 0) {
      return { ok: false, error: text.replace(/\s+/g, ' ').slice(0, 300) };
    }
    const raw = parsed.response.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hit = items.filter((i) => String(i.res_no) === String(resNo));
    return { ok: true, item: hit[0] || null, hitCount: hit.length };
  } catch (e) {
    const body = e.response ? ` / ${e.response.status} ${String(e.response.data).replace(/\s+/g, ' ').slice(0, 200)}` : '';
    return { ok: false, error: `${e.code || ''} ${e.message}${body}` };
  }
}

const priceType = (p) => (!p ? '빈값' : /무료/.test(p) ? '무료표기' : '금액/기타표기');

async function main() {
  if (!KEY) {
    console.log('API_KEY를 읽지 못했습니다. 프로젝트 폴더의 .env를 확인하세요.');
    return;
  }

  const events = loadJsonPath(path.join(CLEAN_DIR, 'events.json'));

  // res_no -> 속한 장르 목록 파일
  const index = new Map();
  for (const g of GENRE_FILES) {
    const file = path.join(LIST_DIR, `${g}.json`);
    if (!fs.existsSync(file)) continue;
    for (const item of loadJsonPath(file)) {
      const k = String(item.res_no);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(g);
    }
  }

  const results = []; // { event, genre, detail }
  const failures = [];
  const skipped = [];
  const stat = {};

  for (const e of events) {
    const genres = index.get(String(e.event_id)) || [];
    const genre = genres.find((g) => DETAIL_SERVICES[g]);
    if (!genre) {
      skipped.push(e);
      continue;
    }
    const r = await fetchOne(genre, e.event_id);
    stat[genre] = stat[genre] || { ok: 0, fail: 0 };
    if (r.ok && r.item) {
      stat[genre].ok++;
      results.push({ event: e, genre, detail: r.item });
    } else {
      stat[genre].fail++;
      failures.push({ event: e, genre, error: r.ok ? `응답에 res_no ${e.event_id} 없음` : r.error });
    }
    await sleep(200);
  }

  // 저장
  const out = results.map((r) => ({ event_id: r.event.event_id, genre: r.genre, detail: r.detail }));
  fs.writeFileSync(path.join(CLEAN_DIR, 'event_details.json'), JSON.stringify(out, null, 2), 'utf-8');

  // ---------- 리포트 ----------
  console.log('========== 호출 결과 ==========');
  console.log(stat);
  for (const f of failures.slice(0, 5)) {
    console.log(`- 실패 [${f.genre}] ${f.event.event_id} ${f.event.title}\n  ${f.error}`);
  }

  console.log(`\n========== 상세 API 없음 (어느 장르 목록에도 없음) ${skipped.length}건 ==========`);
  for (const e of skipped) {
    console.log(`- ${e.category}(${e.category_code}) / ${e.place_name} / ${e.start_date}~${e.end_date} / ${e.title}`);
  }

  console.log('\n========== 목록 vs 상세 불일치 ==========');
  let mismatch = 0;
  for (const { event: e, detail: d } of results) {
    const diffs = [];
    if (String(d.place_id) !== String(e.place_id)) diffs.push(`place_id ${e.place_id} vs ${d.place_id}`);
    if (d.op_st_dt !== e.start_date) diffs.push(`시작일 ${e.start_date} vs ${d.op_st_dt}`);
    if (d.op_ed_dt !== e.end_date) diffs.push(`종료일 ${e.end_date} vs ${d.op_ed_dt}`);
    if (diffs.length) {
      mismatch++;
      console.log(`- ${e.event_id} ${e.title}: ${diffs.join(', ')}`);
    }
  }
  if (!mismatch) console.log('없음');

  console.log('\n========== pay_at(목록) vs price(상세) ==========');
  const combo = {};
  for (const { event: e, detail: d } of results) {
    const key = `pay_at=${e.pay_at} / price ${priceType(d.price)}`;
    combo[key] = (combo[key] || 0) + 1;
  }
  console.log(combo);
  for (const { event: e, detail: d } of results) {
    console.log(`- ${e.category} | pay_at=${e.pay_at} | price="${d.price || ''}" | showtime="${d.showtime || ''}" | ${e.title.slice(0, 25)}`);
  }

  const emptyPrice = results.filter((r) => !r.detail.price).length;
  const emptyShow = results.filter((r) => !r.detail.showtime).length;
  console.log(`\nprice 빈값 ${emptyPrice}건 / showtime 빈값 ${emptyShow}건 (전체 ${results.length}건)`);
  console.log('\n저장 완료: data/clean/event_details.json');
}

main();