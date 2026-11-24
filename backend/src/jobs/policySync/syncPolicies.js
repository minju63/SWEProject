// 취업·진로, 장학·금융 정책 자동 수집 (UC-COM-003). 새 정책만 INSERT 하고 기존 정책은 고치거나 지우지 않는다.
// 한 정책을 넣다가 실패하면 그 정책만 되돌린다(관련 행은 연쇄 삭제). 한 번에 넣는 수는 분야당 POLICY_SYNC_MAX_NEW 건(기본 40)까지.
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/opsLog.js';
import { getPolicies } from '../culture/youthCenter.js';
import { DOMAINS, mapRow, skipReason, norm, canonicalUrl } from './youthPolicy.js';

const MAX_NEW = Number(process.env.POLICY_SYNC_MAX_NEW) || 40;
const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// apply=false 면 DB 에 쓰지 않고 넣었을 정책 목록만 돌려준다 (미리보기)
export async function runPolicySync({ domains = Object.keys(DOMAINS), apply = true, log = console.log } = {}) {
  const today = todayKst();
  const [policies, sources, categories, subcategories, regions] = await Promise.all([
    all('policy', 'title, official_url'),
    all('policy_source', 'external_id, source_type'),
    all('policy_category', 'category_id, category_name'),
    all('policy_subcategory', 'subcategory_id, category_id, subcategory_name'),
    all('region', 'region_code'),
  ]);
  const existing = {
    titles: new Set(policies.map((p) => norm(p.title))),
    urls: new Set(policies.map((p) => canonicalUrl(p.official_url)).filter(Boolean)),
    externalIds: new Set(sources.filter((s) => s.source_type === 'API').map((s) => s.external_id)),
  };
  const regionCodes = new Set(regions.map((r) => r.region_code));
  const report = [];

  for (const key of domains) {
    const cfg = DOMAINS[key];
    const startedAt = new Date().toISOString();
    const result = { domain: key, fetched: 0, added: 0, failed: 0, skipped: {}, titles: [] };
    const category = categories.find((c) => c.category_name === cfg.categoryName);
    if (!category) {
      report.push({ ...result, failed: 1, error: `분야 '${cfg.categoryName}' 없음` });
      continue;
    }
    // 조건마다 받아 정책 번호로 합친다
    const rows = new Map();
    for (const query of cfg.queries) {
      try {
        for (const r of await getPolicies(query)) rows.set(r.plcyNo, r);
      } catch (e) {
        result.failed++;
        log(`[정책 수집:${key}] API 실패 ${JSON.stringify(query)}: ${e.message}`);
      }
    }
    result.fetched = rows.size;

    for (const row of rows.values()) {
      if (result.added >= MAX_NEW) {
        result.skipped.over_limit = (result.skipped.over_limit ?? 0) + 1;
        continue;
      }
      const reason = skipReason(row, cfg, { today, existing });
      if (reason) {
        result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
        continue;
      }
      const m = mapRow(row, cfg);
      if (!regionCodes.has(m.region)) {
        result.skipped.region_missing = (result.skipped.region_missing ?? 0) + 1;
        continue;
      }
      // 같은 실행에서 같은 정책을 두 번 넣지 않도록 기록해 둔다
      existing.titles.add(norm(m.policy.title));
      existing.externalIds.add(m.source.external_id);
      if (m.policy.official_url) existing.urls.add(canonicalUrl(m.policy.official_url));
      result.added++;
      result.titles.push(m.policy.title);
      if (!apply) continue;

      const sub = subcategories.find(
        (s) => s.category_id === category.category_id && s.subcategory_name === m.subcategoryName
      );
      const steps = [
        () => supabase.from('policy').insert({ ...m.policy, category_id: category.category_id }),
        () => supabase.from(cfg.detailTable).insert(m.detail),
        () => supabase.from('policy_source').insert(m.source),
        () => supabase.from('policy_region').insert({ policy_id: m.policy.policy_id, region_code: m.region }),
        ...(sub
          ? [() => supabase.from('policy_subcategory_map').insert({ policy_id: m.policy.policy_id, subcategory_id: sub.subcategory_id })]
          : []),
      ];
      let failed = null;
      for (const step of steps) {
        const { error } = await step();
        if (error) {
          failed = error.message;
          break;
        }
      }
      if (failed) {
        await supabase.from('policy').delete().eq('policy_id', m.policy.policy_id); // 관련 행은 연쇄 삭제
        result.added--;
        result.titles.pop();
        result.failed++;
        log(`[정책 수집:${key}] 넣지 못함 '${m.policy.title}': ${failed}`);
      }
    }

    if (apply) {
      const { error } = await supabase.from('collection_run').insert({
        collection_type: 'API',
        collection_domain: key,
        scheduled_date: today,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: result.failed === 0 ? '성공' : result.added > 0 ? '부분 성공' : '실패',
        collected_count: result.fetched,
        updated_count: result.added,
        failed_count: result.failed,
      });
      if (error) log(`[정책 수집:${key}] 실행 기록 저장 실패: ${error.message}`);
      // 정책 데이터를 바꾼 작업을 감사 로그에 남긴다(NFR-COM-026). 배치 작업이라 작업자는 시스템(사용자 없음)
      await logAudit({
        action: 'POLICY_SYNC',
        table: 'policy',
        key: `${key} ${today} added=${result.added} failed=${result.failed}`,
        ok: result.failed === 0,
        errorCode: result.failed ? 'PARTIAL_FAILURE' : null,
      });
    }
    report.push(result);
  }
  return report;
}
