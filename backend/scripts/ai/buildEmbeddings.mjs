// AI 비서 벡터 검색용 조각을 만들어 DB(ai_search_chunk)에 저장한다 (AI-REQ-COM-007).
//   node scripts/ai/buildEmbeddings.mjs           ← 미리보기: 바뀐 조각 수·예상 글자 수만 (DB·OpenAI 호출 없음)
//   node scripts/ai/buildEmbeddings.mjs --apply   ← 바뀐 조각만 임베딩해 저장, 없어진 조각은 삭제
// 먼저 migrations/20261122_ai_search_chunk.sql 을 Supabase 에서 실행해야 한다.
import 'dotenv/config';
import { supabase } from '../../src/lib/supabase.js';
import { embedTexts, isEmbeddingEnabled } from '../../src/lib/embedding.js';
import { policyChunks, termChunks } from '../../src/services/aiChunks.js';

export async function buildEmbeddings({ apply = false, log = console.log } = {}) {
  const { data: policies, error: pErr } = await supabase.from('policy').select('*').neq('item_type', 'EVENT');
  if (pErr) throw new Error(`정책 조회 실패: ${pErr.message}`);
  const wanted = [...policies.flatMap(policyChunks), ...termChunks()];

  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('ai_search_chunk')
      .select('kind, ref_id, section, content_hash')
      .range(from, from + 999);
    if (error) throw new Error(`ai_search_chunk 조회 실패(SQL 실행 여부 확인): ${error.message}`);
    existing.push(...data);
    if (data.length < 1000) break;
  }
  const key = (c) => `${c.kind}|${c.ref_id}|${c.section}`;
  const have = new Map(existing.map((e) => [key(e), e.content_hash]));
  const wantedKeys = new Set(wanted.map(key));
  const changed = wanted.filter((c) => have.get(key(c)) !== c.content_hash);
  const stale = existing.filter((e) => !wantedKeys.has(key(e)));
  const chars = changed.reduce((n, c) => n + c.content.length, 0);
  log(`전체 ${wanted.length}조각 · 새로/바뀐 ${changed.length}조각(약 ${chars}자) · 지울 ${stale.length}조각`);
  if (!apply) return { changed: changed.length, stale: stale.length, applied: false };
  if (!isEmbeddingEnabled()) throw new Error('OPENAI_API_KEY 가 없거나 EMBEDDING_ENABLED=false 예요');

  for (let i = 0; i < changed.length; i += 100) {
    const batch = changed.slice(i, i + 100);
    const vectors = await embedTexts(batch.map((c) => c.content));
    const rows = batch.map((c, j) => ({
      kind: c.kind,
      ref_id: c.ref_id,
      section: c.section,
      content: c.content,
      content_hash: c.content_hash,
      embedding: vectors[j],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('ai_search_chunk').upsert(rows, { onConflict: 'kind,ref_id,section' });
    if (error) throw new Error(`저장 실패: ${error.message}`);
    log(`  저장 ${Math.min(i + 100, changed.length)}/${changed.length}`);
  }
  for (const s of stale) {
    await supabase.from('ai_search_chunk').delete().match({ kind: s.kind, ref_id: s.ref_id, section: s.section });
  }
  return { changed: changed.length, stale: stale.length, applied: true };
}

if (/buildEmbeddings\.mjs$/.test(process.argv[1] ?? '')) {
  buildEmbeddings({ apply: process.argv.includes('--apply') })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
