// "신청대상: 개인"만 적힌 훈련과정의 원문 링크(고용24 훈련과정 상세, 학원 홈페이지)를 직접 읽어 자격 관련 문장을 모은다.
// 외부 AI 를 쓰지 않는다. 읽은 글은 JSON 으로 저장하고, 자격 관련 문장만 추려 보여 준다(사람이 읽고 판단).
//   node scripts/eligibility/fetchCourseLinks.mjs <links.json> <out.json>
import fs from 'node:fs';

const [linksFile, outFile] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(linksFile, 'utf8'));

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function get(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { text: toText(await res.text()), finalUrl: res.url };
  } catch (e) {
    return { error: e.message };
  }
}

const KEYS =
  /수강\s*대상|훈련\s*대상|모집\s*대상|교육\s*대상|신청\s*자격|수강\s*자격|지원\s*자격|참여\s*자격|누구나|이런\s*분|추천\s*(대상|합니다)|국민내일배움카드|발급|연령|제한|우대|재직|실업자|구직자|취업\s*(희망|준비)|비전공|자격요건|수강\s*조건/;

function extract(url, text) {
  // 고용24 훈련과정 상세: "훈련대상 요건" 구간을 그대로 가져온다
  if (url.includes('work24.go.kr')) {
    const flat = text.replace(/\s+/g, ' ');
    const i = flat.indexOf('훈련대상 요건 선수학습');
    if (i >= 0) {
      const end = flat.indexOf('훈련대상 요건 훈련과정의', i);
      return { kind: 'work24', section: flat.slice(i, end > i ? end : i + 900).slice(0, 900) };
    }
    return { kind: 'work24', section: null };
  }
  const lines = text
    .split(/\n|(?<=[.。!?다요음함])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4 && s.length < 260 && KEYS.test(s));
  return { kind: 'site', lines: [...new Set(lines)].slice(0, 14) };
}

const out = [];
for (const it of items) {
  const urls = [...it.work24, ...it.other].slice(0, 3);
  const results = [];
  for (const url of urls) {
    const r = await get(url);
    results.push(
      r.error
        ? { url, error: r.error }
        : {
            url,
            finalUrl: r.finalUrl,
            len: r.text.length,
            ...extract(url, r.text),
            text: r.text.slice(0, 12000),
          }
    );
  }
  out.push({ no: it.no, title: it.title, results });
  console.log(`#${it.no} ${urls.length}개 링크 확인`);
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log('저장:', outFile);
