// 검색 품질 평가 (AI-REQ-COM-008): 정답이 정해진 질문 50개에서 정답 정책이 검색 상위 5건에 들어오는 비율을 잰다. 목표는 80% 이상.
//   node scripts/ai/evalSearch.mjs            ← 벡터 검색(후보 5건)만 평가
//   node scripts/ai/evalSearch.mjs --chat     ← AI 비서 답변(근거 카드)도 같이 평가 (질문마다 AI 호출이 들어가 오래 걸림)
// 질문과 정답은 scripts/ai/eval-questions.json. 정답은 정책명에 들어 있는 글자(여러 개 중 하나라도 맞으면 정답).
import 'dotenv/config';
import fs from 'node:fs';
import { supabase } from '../../src/lib/supabase.js';
import { searchPolicyCandidates } from '../../src/services/vectorSearch.js';

const questions = JSON.parse(fs.readFileSync(new URL('./eval-questions.json', import.meta.url), 'utf8'));
const withChat = process.argv.includes('--chat');

const { data: policies, error } = await supabase.from('policy').select('policy_id, title').range(0, 2000);
if (error) throw error;
const titleOf = new Map(policies.map((p) => [p.policy_id, p.title]));
const hit = (titles, answers) => titles.some((t) => answers.some((a) => t.includes(a)));

let vectorHits = 0;
let chatHits = 0;
const misses = [];
const chatFn = withChat ? (await import('../../src/services/assistant.service.js')).chat : null;
const rank = (titles, answers) => {
  const i = titles.findIndex((t) => answers.some((a) => t.includes(a)));
  return i < 0 ? null : i + 1;
};

for (const { q, answers } of questions) {
  const cands = await searchPolicyCandidates(q, { limit: 5, timeoutMs: 8000 });
  const titles = cands.map((c) => titleOf.get(c.policy_id) ?? '');
  const ok = hit(titles, answers);
  if (ok) vectorHits++;
  let chatOk = null;
  if (withChat) {
    const r = await chatFn({ userId: null, message: q });
    chatOk = hit((r.cards ?? []).map((c) => c.title ?? ''), answers);
    if (chatOk) chatHits++;
  }
  if (!ok) misses.push({ q, answers, top5: titles });
  console.log(`${ok ? 'O' : 'X'}${withChat ? (chatOk ? ' O' : ' X') : ''}  ${rank(titles, answers) ?? '-'}위  ${q}`);
}

const pct = (n) => `${((n / questions.length) * 100).toFixed(0)}% (${n}/${questions.length})`;
console.log(`\n벡터 검색 상위 5건 적중률: ${pct(vectorHits)}  (목표 80% 이상 ${vectorHits / questions.length >= 0.8 ? '충족' : '미달'})`);
if (withChat) console.log(`AI 비서 답변 카드 적중률: ${pct(chatHits)}`);
if (misses.length) {
  console.log('\n빗나간 질문:');
  for (const m of misses) console.log(`- ${m.q}\n    정답: ${m.answers.join(' / ')}\n    상위5: ${m.top5.join(' | ')}`);
}
process.exit(0);
