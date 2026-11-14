/*
 * 청년공간 웹페이지 수집 (SRS DATA-MAP-04, 하루 1회)
 *   부산청년플랫폼 청년공간 목록(부산진구·사하구), 사하구 청년창업 페이지 2개. 페이지에 적힌 값만 읽는다.
 * 수집 예절: 수집기 이름을 밝히고(User-Agent), robots.txt 를 지키고, 요청 사이 1초 쉰다 (하루 4페이지).
 * 사이트가 막으면 우회하지 않고 실패로 기록한다. 페이지 구조가 바뀌어 읽지 못해도 실패로 기록하고 기존 값을 둔다.
 * 부산청년플랫폼 이용약관은 상업적 이용을 금지한다. 수업 프로젝트(비영리)로만 쓴다.
 */
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { sleep } from './dataGoKr.js';
import { parseDistrict, text } from './normalize.js';

export const USER_AGENT =
  'ChunghaeBot/1.0 (university project; non-commercial; Busan youth service map)';
const TIMEOUT_MS = 20000;
const DELAY_MS = 1000;

const YOUNG_LISTS = {
  부산진구: 'https://young.busan.go.kr/space/list.nm?gugunCd2=003002005',
  사하구: 'https://young.busan.go.kr/space/list.nm?gugunCd2=003002010',
};
const SAHA_PAGES = ['0108010000', '0107020000'].map(
  (mId) => `https://www.saha.go.kr/startup/contents.do?mId=${mId}`
);

// 장소 키: 처음 적재 때와 같이 공간 이름으로 만든다
export const youthKey = (name) => `YSP-${createHash('md5').update(name).digest('hex').slice(0, 8)}`;
const squash = (s) => text(String(s ?? '').replace(/\s+/g, ' '));
const plain = (node) =>
  squash(parse(String(node?.innerHTML ?? '').replace(/<br\s*\/?>/gi, ' ')).text);
const url = (v) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

// robots.txt 의 User-agent: * 규칙. 받지 못하면(없음·차단 화면) 허용으로 본다
async function robotsRules(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const rules = [];
    let forAll = false;
    for (const raw of (await res.text()).split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      const [field, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(field)) forAll = value === '*';
      else if (forAll && /^disallow$/i.test(field) && value) rules.push(value);
    }
    return rules;
  } catch {
    return [];
  }
}

// Disallow 규칙: * 는 아무 글자, 끝의 $ 는 주소 끝
const blocked = (rules, path) =>
  rules.some((rule) => {
    const anchored = rule.endsWith('$');
    const body = (anchored ? rule.slice(0, -1) : rule)
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
  });

export class RobotsBlocked extends Error {}

// 응답 글자 인코딩: 헤더 → <meta charset> 순서로 보고, 없으면 UTF-8 (관공서 페이지 일부는 EUC-KR)
async function decode(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 4096).toString('latin1');
  const charset = (
    res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8'
  ).toLowerCase();
  try {
    return new TextDecoder(charset === 'ks_c_5601-1987' ? 'euc-kr' : charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

// 페이지 하나를 읽는다. robots.txt 가 막으면 RobotsBlocked, 응답 오류는 status 가 붙은 Error
// robots: origin → 규칙 (한 번 실행 동안 같은 사이트의 robots.txt 는 한 번만 받는다)
export async function fetchPage(link, robots) {
  const { origin, pathname, search } = new URL(link);
  if (!robots.has(origin)) robots.set(origin, await robotsRules(origin));
  if (blocked(robots.get(origin), pathname + search))
    throw new RobotsBlocked(`robots.txt 가 허용하지 않음: ${link}`);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(link, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const html = await decode(res);
        await sleep(DELAY_MS);
        return html;
      }
      lastError = Object.assign(new Error(`HTTP ${res.status}: ${link}`), { status: res.status });
      if (res.status !== 429 && res.status < 500) break; // 차단·없는 페이지는 다시 시도하지 않는다
    } catch (e) {
      lastError = new Error(`${e.name === 'TimeoutError' ? '응답 없음' : e.message}: ${link}`);
    }
    await sleep(2000 * 2 ** attempt);
  }
  await sleep(DELAY_MS);
  throw lastError;
}

// 부산청년플랫폼 목록: 공간마다 이름·소개·주소·이용시간·연락처·링크
function parseYoungList(html, district) {
  const root = parse(html);
  const items = root.querySelectorAll('.space_list li.toggle_type');
  const total = Number(squash(root.querySelector('.board_result .total .blue')?.text));
  if (!root.querySelector('.space_list') || (Number.isInteger(total) && total !== items.length))
    throw new Error('부산청년플랫폼 목록 구조가 바뀌어 읽지 못함');
  return items.map((li) => {
    const info = {};
    for (const row of li.querySelectorAll('.arrow_list li')) {
      const [label, value] = row.querySelectorAll('span').map((s) => squash(s.text));
      if (label) info[label.replace(/\s*:$/, '')] = value ?? null;
    }
    const links = {};
    for (const a of li.querySelectorAll('.splink_list a'))
      links[squash(a.querySelector('.splink_txt')?.text)] = url(a.getAttribute('href'));
    const name = squash(li.querySelector('.tit_section')?.text);
    const address = info['주소'] ?? null;
    return {
      key: youthKey(name),
      prefix: 'YSP',
      district: parseDistrict(address) ?? district,
      source_name: 'young.busan.go.kr/space',
      values: {
        name,
        address,
        tel: info['연락처'] ?? null,
        open_hours_text: info['이용시간'] ?? null,
        homepage_url: links['홈페이지'] ?? null,
        description: squash(li.querySelector('.spif_con')?.text),
      },
    };
  });
}

// 사하구 청년창업 페이지: 공간 하나. 위치·운영일·휴관일·전화
function parseSahaPage(html) {
  const root = parse(html);
  const name = squash(root.querySelector('.contact .init em')?.text);
  const location = root
    .querySelectorAll('.rowfull li')
    .find((li) => squash(li.querySelector('em')?.text) === '위치');
  const table = {};
  for (const tr of root.querySelectorAll('.guide table tr'))
    table[squash(tr.querySelector('th')?.text)] = plain(tr.querySelector('td'));
  const tel = squash(root.querySelector('.contact mark')?.text);
  if (!name || !tel || !location) throw new Error('사하구 청년창업 페이지 구조가 바뀌어 읽지 못함');
  const address = plain(location.querySelector('sub'));
  return {
    key: youthKey(name),
    prefix: 'YSP',
    district: parseDistrict(address) ?? '사하구',
    source_name: 'saha.go.kr/startup',
    values: {
      name,
      address,
      tel,
      open_hours_text: table['운영일'] ?? null,
      closed_days_text: table['휴관일'] ?? null,
    },
  };
}

// 4페이지를 모두 읽었을 때만 결과를 낸다 (하나라도 실패하면 오늘은 청년공간을 비교하지 않는다)
export async function crawlYouthSpaces() {
  const robots = new Map();
  const rows = new Map();
  for (const [district, link] of Object.entries(YOUNG_LISTS))
    for (const row of parseYoungList(await fetchPage(link, robots), district))
      rows.set(row.key, row);
  // 사하구 공간은 운영 기관 페이지 값을 우선한다
  for (const link of SAHA_PAGES) {
    const row = parseSahaPage(await fetchPage(link, robots));
    rows.set(row.key, row);
  }
  return [...rows.values()];
}
