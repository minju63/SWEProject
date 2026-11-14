/*
 * 문화·예술 청년정책 공식 웹사이트 하루 1회 확인 (SRS DATA-MAP-16, FR-COM-06)
 *   1. 문화 정책의 공식 안내 주소(policy.official_url)가 SRS 에 적힌 기관 사이트이면 그 페이지를 읽는다.
 *      원문 주소와 최종 확인일을 policy_source(CRAWL)에 남기고, 페이지에 적힌 날짜가 바뀌었거나
 *      페이지가 없어졌으면 place_issues 에 'policy_page_changed' 로 기록한다 (신청 기간 확인용).
 *   2. 부산진구청 공지사항 첫 페이지에서 청년·문화 관련 새 글을 찾아 새 정책 후보로 기록한다.
 *      사하구청 공지사항은 robots.txt 가 게시판(/*bbs*)을 막아 읽지 않는다.
 * 수집 예절은 청년공간 수집과 같다 (수집기 이름, robots.txt, 요청 사이 1초). 값은 사람이 확인한 뒤 고친다.
 */
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { RobotsBlocked, fetchPage } from './youthSpaces.js';

// SRS DATA-MAP-16 에 적힌 기관 → 사이트 주소
export const OFFICIAL_SITES = {
  'www.bscc.or.kr': '부산문화재단',
  'bscc.or.kr': '부산문화재단',
  'young.busan.go.kr': '부산청년플랫폼',
  'www.busan.go.kr': '부산광역시',
  'busan.go.kr': '부산광역시',
  'www.arko.or.kr': '한국문화예술위원회',
  'arko.or.kr': '한국문화예술위원회',
  'www.mnuri.kr': '한국문화예술위원회(문화누리카드)',
  'mnuri.kr': '한국문화예술위원회(문화누리카드)',
  'www.kawf.kr': '한국예술인복지재단',
  'kawf.kr': '한국예술인복지재단',
  'www.mcst.go.kr': '문화체육관광부',
  'youthculturepass.or.kr': '문화체육관광부(청년문화예술패스)',
  'www.youthculturepass.or.kr': '문화체육관광부(청년문화예술패스)',
  'www.busanjin.go.kr': '부산진구청',
  'www.saha.go.kr': '사하구청',
};

const BUSANJIN_NOTICE =
  'https://www.busanjin.go.kr/board/list.busanjin?boardId=BBS_0000009&menuCd=DOM_000000110001001000';
const YOUTH = /청년/;
const CULTURE = /문화|예술|공연|전시|축제|동아리|창작|공간|패스|누리/;

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const hostOf = (link) => {
  try {
    return new URL(link).host;
  } catch {
    return null;
  }
};

// 페이지 본문에 적힌 날짜 (2026.11.14, 2026-11-14, 2026년 11월 14일) → 'YYYY-MM-DD' 목록
export function pageDates(text) {
  const out = new Set();
  const re = /(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})/g;
  for (const [, y, m, d] of String(text).matchAll(re)) {
    const mm = Number(m);
    const dd = Number(d);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
      out.add(`${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  }
  return [...out].sort();
}

// 화면에 보이는 글자만 (스크립트·스타일·머리말·꼬리말 제외)
export function pageFacts(html) {
  const root = parse(html);
  for (const el of root.querySelectorAll('script, style, noscript, header, footer, nav'))
    el.remove();
  const title = squash(root.querySelector('title')?.text) || null;
  const body = squash(root.querySelector('body')?.text ?? root.text);
  return {
    title,
    dates: pageDates(body).slice(0, 60),
    text_hash: createHash('sha1').update(body).digest('hex'),
    length: body.length,
  };
}

/*
 * policies: [{ policy_id, external_id, title, official_url, previous }]  previous = 지난번 CRAWL 원본(raw_data)
 * → { checks: [{ policy_id, external_id, source_name, source_url, raw }], issues, errors, stat }
 */
export async function checkPolicyPages(policies, { fetch = fetchPage, log = () => {} } = {}) {
  const robots = new Map();
  const checks = [];
  const issues = [];
  const errors = [];
  const stat = { target: 0, checked: 0, robots: 0, failed: 0, changed: 0, outside: 0 };
  for (const p of policies) {
    const host = hostOf(p.official_url);
    const site = host ? OFFICIAL_SITES[host] : null;
    if (!site) {
      stat.outside += 1; // SRS 에 적힌 기관 사이트가 아니면 읽지 않는다
      continue;
    }
    stat.target += 1;
    const ref = {
      ref_type: 'policy',
      ref_key: p.external_id,
      policy_id: p.policy_id,
      name: p.title,
    };
    let facts;
    try {
      facts = pageFacts(await fetch(p.official_url, robots));
    } catch (e) {
      if (e instanceof RobotsBlocked) {
        stat.robots += 1;
        continue;
      }
      stat.failed += 1;
      if ([404, 410].includes(e.status))
        issues.push({
          ...ref,
          issue_type: 'policy_page_changed',
          detail: `${site} 공식 페이지를 열 수 없음 (HTTP ${e.status}). 정책 종료·주소 변경 확인`,
        });
      else errors.push({ where: p.official_url, message: e.message });
      continue;
    }
    stat.checked += 1;
    const before = p.previous?.dates;
    if (before && before.join(',') !== facts.dates.join(',')) {
      stat.changed += 1;
      const added = facts.dates.filter((d) => !before.includes(d));
      const removed = before.filter((d) => !facts.dates.includes(d));
      issues.push({
        ...ref,
        issue_type: 'policy_page_changed',
        detail:
          `${site} 공식 페이지의 날짜가 바뀜` +
          (added.length ? ` · 새로 보임 ${added.slice(0, 6).join(', ')}` : '') +
          (removed.length ? ` · 사라짐 ${removed.slice(0, 6).join(', ')}` : '') +
          ' (신청·운영 기간 확인)',
      });
    }
    checks.push({
      policy_id: p.policy_id,
      external_id: p.external_id,
      source_name: site,
      source_url: p.official_url,
      raw: { ...facts, checked_from: 'official_url' },
    });
  }
  log(
    `  공식 페이지 ${stat.target}곳 중 확인 ${stat.checked}, robots 불허 ${stat.robots}, 실패 ${stat.failed}, 날짜 바뀜 ${stat.changed}`
  );

  // 부산진구청 공지사항: 청년 + 문화 관련 제목만 새 정책 후보로
  const notices = [];
  try {
    const root = parse(await fetch(BUSANJIN_NOTICE, robots));
    const rows = root.querySelectorAll('table tbody tr');
    if (!rows.length) throw new Error('부산진구청 공지사항 목록 구조가 바뀌어 읽지 못함');
    for (const tr of rows) {
      const a = tr.querySelector('td.title a');
      const title = squash(a?.getAttribute('title') ?? a?.text);
      const sid = a?.getAttribute('href')?.match(/dataSid=(\d+)/)?.[1];
      if (!title || !sid || !YOUTH.test(title) || !CULTURE.test(title)) continue;
      notices.push({
        ref_type: 'policy',
        ref_key: `BJN-${sid}`,
        policy_id: null,
        name: title,
        issue_type: 'policy_notice_candidate',
        detail: `부산진구청 공지사항 ${squash(tr.querySelector('td.date')?.text)} · ${squash(tr.querySelector('td.name')?.text)} · https://www.busanjin.go.kr/board/view.busanjin?boardId=BBS_0000009&dataSid=${sid} (문화 정책이면 자격·서류 정리 후 추가)`,
      });
    }
    log(`  부산진구청 공지사항 청년·문화 글 ${notices.length}건`);
  } catch (e) {
    if (!(e instanceof RobotsBlocked)) errors.push({ where: BUSANJIN_NOTICE, message: e.message });
  }
  return {
    checks,
    issues: [...issues, ...notices],
    errors,
    stat: { ...stat, notices: notices.length },
  };
}
