// 하루 1회 갱신이 읽고 쓰는 DB (service_role 키, 서버에서만 실행)
import { supabase } from '../../lib/supabase.js';

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const chunk = (arr, n = 100) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const exists = async (table, column) => !(await supabase.from(table).select(column).limit(1)).error;

// 갱신 작업용 컬럼·테이블 (migrations/20261114_culture_sync.sql)
export async function schemaReady() {
  const [baseline, detailFetched, issues] = await Promise.all([
    exists('place', 'source_values'),
    exists('culture_detail', 'detail_fetched'),
    exists('place_issues', 'issue_id'),
  ]);
  return { baseline, detailFetched, issues, all: baseline && detailFetched && issues };
}

export async function loadPlaces(withBaseline) {
  const columns = [
    'place_id',
    'place_key',
    'name',
    'region_code',
    'is_active',
    'address',
    'tel',
    'homepage_url',
    'open_hours_text',
    'closed_days_text',
    'capacity',
    'fee_text',
    'description',
    'merged_from:raw_data->extra_json->merged_from', // 다른 출처와 합친 장소의 옛 키
  ];
  if (withBaseline) columns.push('source_values');
  return must(await supabase.from('place').select(columns.join(', ')), 'place 조회');
}

// 부산 문화 API 에서 온 행사 출처 + 종료 시각 (지난번 상세 응답 재사용, 원본에서 사라진 행사 확인)
export async function loadEventSources() {
  const rows = must(
    await supabase
      .from('policy_source')
      .select('policy_id, external_id, source_name, raw_data')
      .eq('source_type', 'API')
      .like('source_name', '부산광역시 문화 API%'),
    'policy_source 조회'
  );
  const details = new Map();
  for (const part of chunk(rows.map((r) => r.policy_id))) {
    const found = must(
      await supabase
        .from('culture_detail')
        .select('policy_id, event_end_at, place_id')
        .in('policy_id', part),
      'culture_detail 조회'
    );
    for (const d of found) details.set(d.policy_id, d);
  }
  return rows.map((r) => ({
    ...r,
    event_end_at: details.get(r.policy_id)?.event_end_at ?? null,
    place_id: details.get(r.policy_id)?.place_id ?? null,
  }));
}

export async function loadReferences() {
  const categories = must(
    await supabase.from('policy_category').select('category_id, category_name'),
    'policy_category 조회'
  );
  const regions = must(await supabase.from('region').select('region_code'), 'region 조회');
  return {
    categoryId: categories.find((c) => c.category_name === '문화')?.category_id ?? null,
    regions: new Set(regions.map((r) => r.region_code)),
  };
}

// 같은 출처 키가 다른 정책에 연결돼 있으면 덮어쓰지 않는다
export async function sourceKeyConflicts(sources) {
  const want = new Map(sources.map((s) => [`${s.source_type}:${s.external_id}`, s.policy_id]));
  const conflicts = [];
  for (const part of chunk(sources.map((s) => s.external_id))) {
    const rows = must(
      await supabase
        .from('policy_source')
        .select('policy_id, source_type, external_id')
        .in('external_id', part),
      'policy_source 조회'
    );
    for (const r of rows) {
      const id = want.get(`${r.source_type}:${r.external_id}`);
      if (id && id !== r.policy_id)
        conflicts.push(`다른 정책에 연결된 출처 키: ${r.source_type}:${r.external_id}`);
    }
  }
  return conflicts;
}

export async function loadIssues() {
  return must(
    await supabase.from('place_issues').select('issue_id, issue_type, ref_key, status'),
    'place_issues 조회'
  );
}

// ---------------------------------------------------------------- 쓰기

// 바뀐 항목과 원본 기준값만 고친다 (좌표·요금 구분·사진은 건드리지 않음)
export async function updatePlaces(updates, now) {
  for (const u of updates) {
    const patch = { ...u.changes, source_values: u.baseline, source_checked_at: now };
    if (Object.keys(u.changes).length) patch.updated_at = now;
    must(
      await supabase.from('place').update(patch).eq('place_id', u.place_id),
      `place 갱신 ${u.place_key}`
    );
  }
}

// 행사 적재 (같은 policy_id 면 갱신). scripts/culture/loadCulture.js 의 적재와 같은 순서
export async function upsertEvents(mapped, categoryId, now) {
  const policies = mapped.map(({ policy: { _category_name, ...p } }) => ({
    ...p,
    category_id: categoryId,
    updated_at: now,
  }));
  for (const part of chunk(policies))
    must(await supabase.from('policy').upsert(part, { onConflict: 'policy_id' }), 'policy 적재');
  for (const part of chunk(mapped.map((x) => x.detail)))
    must(
      await supabase.from('culture_detail').upsert(part, { onConflict: 'policy_id' }),
      'culture_detail 적재'
    );
  for (const part of chunk(mapped.map((x) => x.source)))
    must(
      await supabase.from('policy_source').upsert(part, { onConflict: 'source_type,external_id' }),
      'policy_source 적재'
    );
  const ids = mapped.map((x) => x.policy.policy_id);
  for (const part of chunk(ids))
    must(await supabase.from('policy_region').delete().in('policy_id', part), 'policy_region 정리');
  for (const part of chunk(mapped.flatMap((x) => x.regions)))
    must(await supabase.from('policy_region').insert(part), 'policy_region 적재');
}

/*
 * place_issues 반영. 같은 문제(issue_type + ref_key)는 한 행으로 두고 마지막 확인 시각·내용만 바꾼다.
 *   - 사람이 '확인'·'무시'로 바꾼 문제는 상태를 건드리지 않는다.
 *   - '해결'이었는데 다시 나오면 '미처리'로 되돌린다.
 *   - autoResolve 종류 중 이번 점검에서 다시 나오지 않은 '미처리' 문제는 '해결'로 바꾼다.
 */
export async function saveIssues(found, autoResolve, now) {
  const existing = await loadIssues();
  const keyOf = (i) => `${i.issue_type}|${i.ref_key}`;
  const current = new Map(existing.map((i) => [keyOf(i), i]));
  const rows = [...new Map(found.map((f) => [keyOf(f), f])).values()].map((f) => ({
    issue_type: f.issue_type,
    ref_type: f.ref_type,
    ref_key: f.ref_key,
    place_id: f.place_id ?? null,
    name: f.name ?? null,
    detail: f.detail ?? null,
    last_seen_at: now,
  }));
  for (const part of chunk(rows))
    must(
      await supabase.from('place_issues').upsert(part, { onConflict: 'issue_type,ref_key' }),
      'place_issues 기록'
    );

  const seen = new Set(rows.map(keyOf));
  const reopen = existing.filter((i) => i.status === '해결' && seen.has(keyOf(i)));
  const resolve = existing.filter(
    (i) => i.status === '미처리' && autoResolve.has(i.issue_type) && !seen.has(keyOf(i))
  );
  for (const part of chunk(reopen.map((i) => i.issue_id)))
    must(
      await supabase
        .from('place_issues')
        .update({ status: '미처리', resolved_at: null })
        .in('issue_id', part),
      'place_issues 다시 열기'
    );
  for (const part of chunk(resolve.map((i) => i.issue_id)))
    must(
      await supabase
        .from('place_issues')
        .update({ status: '해결', resolved_at: now })
        .in('issue_id', part),
      'place_issues 자동 해결'
    );
  return {
    new: rows.filter((r) => !current.has(keyOf(r))).length,
    reopened: reopen.length,
    resolved: resolve.length,
  };
}

// 팀 공통 수집 기록 (collection_run, collection_error)
export async function saveRun(run, errors) {
  const [row] = must(
    await supabase.from('collection_run').insert(run).select('run_id'),
    'collection_run 기록'
  );
  if (errors.length)
    must(
      await supabase
        .from('collection_error')
        .insert(errors.map((e) => ({ ...e, run_id: row.run_id, resolution_status: '미처리' }))),
      'collection_error 기록'
    );
  return row.run_id;
}
