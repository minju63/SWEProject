// 취업·진로 정책별 "검토 자료"를 한 파일로 모은다 (DB 값 + 공고 원문에서 자격과 관련된 문장).
// 사람이(또는 Claude 가) 읽고 조건을 직접 정리하기 위한 준비 단계라서 외부 AI 를 쓰지 않는다.
//   node scripts/eligibility/buildDossiers.mjs   → OUT_DIR/dossiers.json, clusters.json
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../../src/lib/supabase.js';

const OUT_DIR = process.env.OUT_DIR || path.resolve('tmp-eligibility');
const DATA_DIR = process.env.SW_DATA_DIR || path.resolve('../../SWProject');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
const sourceText = readJson('source_text_cache.json');
const attachments = readJson('attachment_text_cache.json');
const youthcenter = readJson('youthcenter_detail_cache.json');

const KEYS =
  /대상|자격|신청\s*요건|모집\s*요건|참여\s*요건|연령|\d{1,2}\s*세|거주|주소|소재|제외|불가|제한|우대|재학|졸업|재직|미취업|구직|실업|소득|중위|수급|장애|한부모/;

// 자격과 관련된 문장만 골라 길이를 줄인다
function excerpt(text, max = 900) {
  const sentences = String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.。!?다요음함])\s+|\s*[○●■□▶▷※ㅇ]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && KEYS.test(s));
  const seen = new Set();
  const out = [];
  for (const s of sentences) {
    const k = s.slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.slice(0, 220));
    if (out.join(' ').length > max) break;
  }
  return out.join(' / ').slice(0, max);
}

const { data: cats } = await supabase.from('policy_category').select('category_id, category_name');
const job = cats.find((c) => c.category_name === '취업·진로');
const { data: ps, error } = await supabase
  .from('policy')
  .select(
    'policy_id, title, item_type, min_age, max_age, official_url, target_summary, income_condition, eligibility_conditions'
  )
  .eq('category_id', job.category_id)
  .order('title')
  .limit(1000);
if (error) throw error;

const dossiers = ps.map((p, i) => {
  const old = p.eligibility_conditions ?? {};
  const hints = old.structured_hints ?? {};
  const url = p.official_url;
  const id = (url ?? '').match(/(\d{15,})$/)?.[1];
  const yc = id ? youthcenter[id] : null;
  const notice = [
    yc?.plcyExplnCn,
    yc?.addAplyQlfcCndCn,
    yc?.ptcpPrpTrgtCn,
    yc?.sprtTrgtAgeLmtYn === 'Y' ? `연령 만 ${yc.sprtTrgtMinAge}~${yc.sprtTrgtMaxAge}세` : '',
    sourceText[url],
    attachments[url]?.text,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    no: i + 1,
    policy_id: p.policy_id,
    title: p.title,
    url,
    db: {
      target: p.target_summary || null,
      age: p.min_age != null || p.max_age != null ? [p.min_age, p.max_age] : null,
      income: p.income_condition || null,
      hints,
      required_text: (old.required ?? []).map((r) => r.text).filter(Boolean),
      exclusions_text: (old.exclusions ?? [])
        .map((e) => e?.condition?.text ?? e?.text)
        .filter(Boolean),
    },
    notice: excerpt(notice),
    notice_len: notice.length,
  };
});

// 같은 자격 내용끼리 묶는다 (훈련과정처럼 같은 문구가 반복되는 정책이 많다)
const keyOf = (d) =>
  JSON.stringify([
    d.db.target,
    d.db.age,
    d.db.income,
    d.db.hints,
    d.db.exclusions_text,
    d.notice.slice(0, 300),
  ]);
const groups = new Map();
for (const d of dossiers) {
  const k = keyOf(d);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(d.no);
}
const clusters = [...groups.values()].map((nos, i) => ({ cluster: i + 1, nos }));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'dossiers.json'), JSON.stringify(dossiers, null, 1));
fs.writeFileSync(path.join(OUT_DIR, 'clusters.json'), JSON.stringify(clusters));
console.log(`정책 ${dossiers.length}건, 같은 내용 묶음 ${clusters.length}개`);
console.log('원문(공고) 글이 거의 없는 정책:', dossiers.filter((d) => d.notice_len < 100).length);
