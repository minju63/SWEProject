/*
 * 지도 탭 장소·행사 하루 1회 갱신 (SRS FR-MAP-029, DP-MAP-01·02)
 *   1. 장소 원본 3종을 받아 DB 장소와 비교한다 (places.js: 사람이 고친 값은 그대로 둔다)
 *   2. 행사 9개 장르 + 테마 + 상세를 받아 정제하고 장소에 연결한다 (events.js)
 *   3. 적재 전 무결성 점검. 하나라도 걸리면 장소·행사를 적재하지 않고 실패로 기록한다
 *        장소 키 중복 0건, 행사가 가리키는 장소가 모두 DB 에 있음,
 *        행사 번호·출처 키 중복 0건, 다른 정책과 출처 키 충돌 0건, 날짜 역전 0건, 분류·지역 코드 있음
 *   4. apply 일 때만 DB 에 쓴다: 장소 원본 값, 행사, place_issues, collection_run·collection_error
 * 공공데이터 일부를 받지 못하면 받은 것만 반영하고(나머지는 기존 값 유지) '부분 성공'으로 남긴다.
 * 끝난 행사는 적재하지 않으며 DB 에서 지우지도 않는다(지도 API 가 종료일로 거른다).
 */
import { QuotaError } from './dataGoKr.js';
import * as db from './db.js';
import { buildEventRows, liveEvents } from './events.js';
import { mapEventRow } from './mapping.js';
import { SOURCE_LABEL, planPlaceSync, placeSources } from './places.js';
import { EVENT_GENRES, apiSource } from './sources.js';

export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const EVENT_TYPES = ['공연', '전시', '문화프로그램'];
const PLACE_SOURCES = [
  ['CUL', 'performPlaces'],
  ['LIB', 'libraries'],
  ['OPN', 'publicFacilities'],
];
const DETAIL_GIVE_UP = 3; // 상세 API 가 연속 3번 실패하면 남은 행사는 지난번 상세 응답을 쓴다
const BUSAN_GIVE_UP = 2; // 부산 문화 API 가 연속 2번 응답하지 않으면 남은 목록 호출을 건너뛴다

const countBy = (list, fn) =>
  list.reduce((acc, x) => ({ ...acc, [fn(x)]: (acc[fn(x)] ?? 0) + 1 }), {});

function duplicates(values) {
  const seen = new Set();
  const dup = new Set();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

// 적재 전 무결성 점검 (FR-MAP-029)
function checkIntegrity({ places, mapped, refs }) {
  const problems = [];
  for (const k of duplicates(places.map((p) => p.place_key))) problems.push(`장소 키 중복: ${k}`);
  for (const k of duplicates(places.map((p) => p.place_id))) problems.push(`장소 번호 중복: ${k}`);
  const placeIds = new Set(places.filter((p) => p.is_active).map((p) => p.place_id));
  for (const k of duplicates(mapped.map((x) => x.policy.policy_id)))
    problems.push(`행사 번호 중복: ${k}`);
  for (const k of duplicates(mapped.map((x) => `${x.source.source_type}:${x.source.external_id}`)))
    problems.push(`출처 키 중복: ${k}`);
  if (mapped.length && !refs.categoryId) problems.push("policy_category 에 '문화'가 없음");
  for (const { detail: d, regions, meta } of mapped) {
    if (d.place_id && !placeIds.has(d.place_id))
      problems.push(`장소 테이블에 없는 장소를 가리키는 행사: ${meta.id}`);
    if (!EVENT_TYPES.includes(d.culture_type))
      problems.push(`culture_type 허용 밖: ${meta.id} ${d.culture_type}`);
    if (d.event_start_at && d.event_end_at && d.event_start_at > d.event_end_at)
      problems.push(`행사 기간 역전: ${meta.id}`);
    for (const r of regions)
      if (!refs.regions.has(r.region_code)) problems.push(`region 에 없는 코드: ${r.region_code}`);
  }
  return problems;
}

export async function runCultureSync({
  apply = false,
  today = kstToday(),
  source = apiSource,
  log = () => {},
} = {}) {
  const startedAt = new Date().toISOString();
  const errors = []; // collection_error 행
  const fail = (where, e) => {
    errors.push({ error_type: 'API', source_url: where, error_message: e.message, retry_count: 2 });
    log(`  실패 ${where}: ${e.message}`);
  };

  const schema = await db.schemaReady();
  if (apply && !schema.all)
    throw new Error('supabase/migrations/20261114_culture_sync.sql 을 먼저 실행하세요.');
  const places = await db.loadPlaces(schema.baseline);
  const activePlaces = places.filter((p) => p.is_active);

  // 부산 문화 API(행사·공연장)는 제공기관 서버가 멈추는 날이 있다.
  // 연속 2번 응답하지 않으면 남은 호출은 건너뛰고 기존 데이터를 둔다 (호출마다 재시도로 수십 분 걸리지 않게)
  let busanFailures = 0;
  const busanSkipped = [];
  const busan = async (where, call) => {
    if (busanFailures >= BUSAN_GIVE_UP) {
      busanSkipped.push(where);
      return null;
    }
    try {
      const result = await call();
      busanFailures = 0;
      return result;
    } catch (e) {
      busanFailures = e instanceof QuotaError ? BUSAN_GIVE_UP : busanFailures + 1;
      fail(where, e);
      return null;
    }
  };
  const other = async (where, call) => {
    try {
      return await call();
    } catch (e) {
      fail(where, e);
      return null;
    }
  };

  // ---------- 1. 장소 원본 ----------
  log('장소 원본 수집');
  const raw = {};
  const checked = new Set();
  for (const [prefix, fn] of PLACE_SOURCES) {
    const result = await (prefix === 'CUL' ? busan : other)(fn, () => source[fn]());
    if (!result) continue;
    raw[fn] = result;
    checked.add(prefix);
    log(`  ${SOURCE_LABEL[prefix]} ${result.length}건`);
  }
  const sources = placeSources(raw);
  const placePlan = planPlaceSync(activePlaces, sources, checked);

  // ---------- 2. 행사 ----------
  log('행사 수집');
  const lists = {};
  for (const genre of Object.keys(EVENT_GENRES)) {
    const result = await busan(`eventList:${genre}`, () => source.eventList(genre));
    if (!result) continue;
    lists[genre] = result;
    log(`  ${genre} ${result.length}건`);
  }
  const allLists = Object.keys(lists).length === Object.keys(EVENT_GENRES).length;
  const themes = (await busan('themes', () => source.themes())) ?? [];
  const themesOk = themes.length > 0;
  if (themesOk) log(`  테마 ${themes.length}건`);
  if (busanSkipped.length) {
    errors.push({
      error_type: 'API',
      source_url: busanSkipped.join(', '),
      error_message: '부산 문화 API 가 연속으로 응답하지 않아 호출하지 않음 (기존 데이터 유지)',
      retry_count: 0,
    });
    log(`  건너뜀: ${busanSkipped.join(', ')}`);
  }
  const known = await db.loadEventSources();
  const knownGenre = new Map(
    known
      .map((r) => r.external_id?.match(/^([a-z]+)-(\d+)$/))
      .filter(Boolean)
      .map(([, genre, resNo]) => [resNo, genre])
  );
  const { live, skipped } = liveEvents(lists, today, knownGenre);

  // 상세 API: 진행 중·예정 행사마다 호출. 실패하면 지난번 상세 응답을 쓴다
  log(`상세 수집 (진행 중·예정 ${live.length}건)`);
  const previous = new Map(
    known
      .filter((r) => /DetailService$/.test(r.source_name ?? '') && r.raw_data)
      .map((r) => [r.external_id, r.raw_data])
  );
  const details = new Map();
  const detailStat = { api: 0, previous: 0, none: 0 };
  let streak = 0;
  for (const { genre, resNo } of live) {
    const id = `${genre}-${resNo}`;
    let item = null;
    if (streak < DETAIL_GIVE_UP && busanFailures < BUSAN_GIVE_UP) {
      try {
        item = await source.eventDetail(genre, resNo);
        streak = 0;
      } catch (e) {
        streak = e instanceof QuotaError ? DETAIL_GIVE_UP : streak + 1;
        if (streak >= DETAIL_GIVE_UP) fail(`eventDetail (${id}부터 지난번 응답 사용)`, e);
      }
    }
    if (item) {
      details.set(id, item);
      detailStat.api += 1;
    } else if (previous.has(id)) {
      details.set(id, previous.get(id));
      detailStat.previous += 1;
    } else detailStat.none += 1;
  }

  const placeByKey = new Map(activePlaces.map((p) => [p.place_key, p]));
  const placeById = new Map(activePlaces.map((p) => [p.place_id, p]));
  const previousPlace = new Map(
    known
      .filter((r) => placeById.has(r.place_id))
      .map((r) => [r.external_id, placeById.get(r.place_id)])
  );
  const built = buildEventRows({
    live,
    themes,
    details,
    places: activePlaces,
    performPlaces: raw.performPlaces ?? [],
    previousPlace,
    today,
  });
  const mapped = built.rows.map(({ row, detail }) =>
    mapEventRow(row, { detailItem: detail, placeByKey })
  );

  // ---------- 3. 무결성 점검 ----------
  const refs = await db.loadReferences();
  const problems = [
    ...checkIntegrity({ places, mapped, refs }),
    ...(await db.sourceKeyConflicts(mapped.map((x) => x.source))),
  ];

  // ---------- place_issues ----------
  const issues = [...placePlan.issues];
  for (const v of built.unmatched)
    issues.push({
      issue_type: 'event_place_unmatched',
      ref_type: 'venue',
      ref_key: v.key,
      name: v.name,
      detail: `${v.reason} · 행사 ${v.events.length}건 (예: ${v.events.slice(0, 3).join(', ')})`,
    });
  // 원본에서 사라진 행사: 9개 장르를 모두 받은 날만 판단한다
  if (allLists) {
    const listed = new Set(
      Object.entries(lists).flatMap(([g, items]) => items.map((e) => `${g}-${e.res_no}`))
    );
    for (const r of known)
      if (r.event_end_at && r.event_end_at.slice(0, 10) >= today && !listed.has(r.external_id))
        issues.push({
          issue_type: 'event_missing_in_source',
          ref_type: 'event',
          ref_key: r.external_id,
          name: r.raw_data?.title ?? null,
          detail:
            '행사 목록 API 에서 사라짐 (취소·변경 확인 필요). 지도에는 종료일까지 계속 보인다',
        });
  }
  // 이번에 빠짐없이 점검한 종류만 자동 해결 대상
  const autoResolve = new Set();
  if (checked.size === PLACE_SOURCES.length)
    autoResolve.add('place_missing_in_source').add('new_place_candidate');
  if (allLists && themesOk) autoResolve.add('event_place_unmatched');
  if (allLists) autoResolve.add('event_missing_in_source');

  const collected = live.length > 0 || checked.size > 0;
  const status = problems.length || !collected ? '실패' : errors.length ? '부분 성공' : '성공';
  const existingIds = new Set(known.map((r) => r.policy_id));
  // 이미 있던 행사 중 장소 연결이 바뀌는 것 (끊기면 지도 상세에서 빠진다)
  const prevPlace = new Map(known.map((r) => [r.policy_id, r.place_id]));
  const relinked = mapped
    .filter(
      (x) =>
        prevPlace.has(x.policy.policy_id) &&
        (prevPlace.get(x.policy.policy_id) ?? null) !== (x.detail.place_id ?? null)
    )
    .map((x) => ({
      id: x.meta.id,
      title: x.policy.title,
      linked: !!x.detail.place_id,
    }));
  const placeChanges = placePlan.updates.filter((u) => Object.keys(u.changes).length);

  const report = {
    today,
    source: source.name,
    apply,
    schemaReady: schema.all,
    status,
    places: {
      fetched: Object.fromEntries(PLACE_SOURCES.map(([p, fn]) => [p, raw[fn]?.length ?? null])),
      compared: activePlaces.filter((p) => checked.has(p.place_key.slice(0, 3))).length,
      changes: placeChanges.map((u) => ({
        place_key: u.place_key,
        name: u.name,
        changes: u.changes,
      })),
      baselines: placePlan.updates.length,
    },
    events: {
      lists: Object.fromEntries(
        Object.keys(EVENT_GENRES).map((g) => [g, lists[g]?.length ?? null])
      ),
      themes: themesOk ? themes.length : null,
      live: live.length,
      skippedEndedOrInvalid: skipped,
      detail: detailStat,
      linked: {
        byId: built.stat.byId,
        byName: built.stat.byName,
        previous: built.stat.previous,
        none: built.stat.unmatched,
      },
      new: mapped.filter((x) => !existingIds.has(x.policy.policy_id)).length,
      updated: mapped.filter((x) => existingIds.has(x.policy.policy_id)).length,
      relinked,
    },
    issues: countBy(issues, (i) => i.issue_type),
    issueList: issues,
    problems,
    errors,
  };
  if (!apply) return report;

  const now = new Date().toISOString();
  if (!problems.length) {
    await db.updatePlaces(placePlan.updates, now);
    await db.upsertEvents(mapped, refs.categoryId, now);
  }
  report.issueChanges = await db.saveIssues(issues, autoResolve, now);
  report.runId = await db.saveRun(
    {
      collection_type: 'API',
      collection_domain: 'CULTURE',
      scheduled_date: today,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status,
      collected_count: live.length + sources.size,
      updated_count: problems.length ? 0 : mapped.length + placeChanges.length,
      failed_count: errors.length + problems.length,
    },
    [
      ...errors,
      ...problems.map((p) => ({ error_type: 'INTEGRITY', source_url: null, error_message: p })),
    ]
  );
  return report;
}
