// 문화 파트 수집 데이터 → Supabase 적재
//
// 실행 (backend 폴더에서):
//   node scripts/culture/loadCulture.js            # dry-run: DB에 쓰지 않고 미리보기 파일만 만든다
//   node scripts/culture/loadCulture.js --check    # DB 읽기만: 마이그레이션·지역 코드·출처 키 충돌 점검
//   node scripts/culture/loadCulture.js --apply    # 실제 적재 (backend/.env 의 service_role 키 사용)
//
// 옵션:
//   --data-dir <dir>   culture.csv, events.csv, places.csv 위치 (기본: 저장소 옆 ../data)
//   --raw-dir <dir>    API 원본 위치: detail/*.json, youth/raw/*.json (기본: ../busan-culture-api/data)
//   --out <dir>        미리보기 저장 위치 (기본: <data-dir>/db_load_preview)
//   --today YYYY-MM-DD 이 날짜보다 먼저 끝난 행사는 제외 (기본: 오늘, KST)
//   --only place       place 테이블만 갱신 (정책·행사는 건드리지 않음)
//
// 적재 전 Supabase SQL Editor에서 supabase/migrations/20261111_culture_place.sql 을 먼저 실행해야 한다.
// 좌표 값은 콘솔과 미리보기 파일에 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';
import { CULTURE_SUBCATEGORY, mapCultureRow, mapEventRow, mapPlaceRow } from './mapping.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

function args() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const dataDir = path.resolve(get('--data-dir') ?? path.join(repoRoot, '..', 'data'));
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    apply: a.includes('--apply'),
    check: a.includes('--check'),
    only: get('--only') ?? null,
    dataDir,
    rawDir: path.resolve(
      get('--raw-dir') ?? path.join(repoRoot, '..', 'busan-culture-api', 'data')
    ),
    outDir: path.resolve(get('--out') ?? path.join(dataDir, 'db_load_preview')),
    today: get('--today') ?? kstToday,
  };
}

const readCsv = (file) => parseCsv(fs.readFileSync(file, 'utf8'));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const CULTURE_TYPES = [
  '공연',
  '전시',
  '문화프로그램',
  '문화할인',
  '문화비지원',
  '창작지원',
  '교육·인력양성',
  '청년공간',
];
const PLACE_TYPES = ['공연장', '전시공간', '도서관', '체육시설', '청년공간', '공공시설'];

function build(opt) {
  const issues = [];
  const culture = readCsv(path.join(opt.dataDir, 'culture.csv'));
  const events = readCsv(path.join(opt.dataDir, 'events.csv'));
  const places = readCsv(path.join(opt.dataDir, 'places.csv'));

  // 장소
  const placeRows = places.map(mapPlaceRow);
  const placeByKey = new Map(placeRows.map((p) => [p.place_key, p]));
  const placeKeys = new Set(placeByKey.keys());

  // 온통청년 원본: 제목이 CSV에서도, 원본에서도 하나뿐일 때만 연결한다.
  const youthRawFile = path.join(
    opt.rawDir,
    'youth',
    'raw',
    'youth_policy_culture_2026-10-08.json'
  );
  const youthItems = fs.existsSync(youthRawFile) ? readJson(youthRawFile).items : [];
  const rawByTitle = new Map();
  for (const it of youthItems)
    rawByTitle.set(it.plcyNm, [...(rawByTitle.get(it.plcyNm) ?? []), it]);
  const csvTitleCount = new Map();
  for (const r of culture)
    csvTitleCount.set(r['정책명'], (csvTitleCount.get(r['정책명']) ?? 0) + 1);

  const cultureIn = culture.filter((r) => CULTURE_SUBCATEGORY[r['세부분류']]);
  const cultureSkipped = culture.filter((r) => !CULTURE_SUBCATEGORY[r['세부분류']]);
  const cultureMapped = cultureIn.map((r) => {
    const cands = rawByTitle.get(r['정책명']) ?? [];
    const rawItem = csvTitleCount.get(r['정책명']) === 1 && cands.length === 1 ? cands[0] : null;
    return mapCultureRow(r, { rawItem, placeKeys });
  });

  // 행사: 종료일이 있고 오늘 이후인 것만
  const eventsIn = events.filter((e) => e.end_date && e.end_date >= opt.today);
  const eventsSkipped = events.length - eventsIn.length;
  const eventMapped = eventsIn.map((e) => {
    const f = path.join(opt.rawDir, 'detail', `${e.genre}_${e.res_no}.json`);
    const detailItem = fs.existsSync(f) ? readJson(f).item : null;
    return mapEventRow(e, { detailItem, placeByKey });
  });

  const all = [...cultureMapped, ...eventMapped];

  // 검증
  const ids = new Set();
  const srcKeys = new Set();
  for (const { policy: p, detail: d, source: s, meta } of all) {
    if (ids.has(p.policy_id)) issues.push(`policy_id 중복: ${meta.id}`);
    ids.add(p.policy_id);
    const k = `${s.source_type}:${s.external_id}`;
    if (srcKeys.has(k)) issues.push(`policy_source 키 중복: ${k}`);
    srcKeys.add(k);
    if (!CULTURE_TYPES.includes(d.culture_type))
      issues.push(`culture_type 허용 밖: ${meta.id} ${d.culture_type}`);
    if (p.min_age != null && p.max_age != null && p.min_age > p.max_age)
      issues.push(`나이 역전: ${meta.id}`);
    if (
      p.application_start_date &&
      p.application_end_date &&
      p.application_start_date > p.application_end_date
    )
      issues.push(
        `신청기간 역전: ${meta.id} ${p.application_start_date} > ${p.application_end_date}`
      );
    if (d.event_start_at && d.event_end_at && d.event_start_at > d.event_end_at)
      issues.push(`행사기간 역전: ${meta.id}`);
  }
  for (const p of placeRows) {
    if (!PLACE_TYPES.includes(p.place_type))
      issues.push(`place_type 허용 밖: ${p.place_key} ${p.place_type}`);
    if (!p.region_code) issues.push(`장소 지역코드 없음: ${p.place_key}`);
  }

  return {
    placeRows,
    cultureMapped,
    eventMapped,
    cultureSkipped,
    eventsSkipped,
    all,
    issues,
    youthItems,
  };
}

function count(arr, fn) {
  const m = {};
  for (const x of arr) {
    const k = fn(x) ?? '(NULL)';
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

function writePreview(opt, b) {
  fs.mkdirSync(opt.outDir, { recursive: true });
  const w = (name, data) =>
    fs.writeFileSync(path.join(opt.outDir, name), JSON.stringify(data, null, 2));
  w(
    'policy.json',
    b.all.map((x) => x.policy)
  );
  w(
    'culture_detail.json',
    b.all.map((x) => x.detail)
  );
  w(
    'policy_source.json',
    b.all.map((x) => x.source)
  );
  w(
    'policy_region.json',
    b.all.flatMap((x) => x.regions)
  );
  // 좌표·원본행은 미리보기에서 뺀다 (좌표 출력 금지 규칙)
  const HIDDEN = new Set(['lat', 'lng', 'raw_data']);
  w(
    'place.json',
    b.placeRows.map((p) => ({
      ...Object.fromEntries(Object.entries(p).filter(([k]) => !HIDDEN.has(k))),
      has_coord: p.lat != null,
    }))
  );

  const cm = b.cultureMapped;
  const em = b.eventMapped;
  const lines = [];
  const L = (s = '') => lines.push(s);
  L(`# 문화 파트 적재 미리보기 (dry-run, 기준일 ${opt.today})`);
  L();
  L('## 건수');
  L(`| 테이블 | 건수 | 내역 |`);
  L(`|---|---|---|`);
  L(
    `| place | ${b.placeRows.length} | ${JSON.stringify(count(b.placeRows, (p) => p.place_type))} |`
  );
  L(`| policy | ${b.all.length} | 정책 ${cm.length} + 행사 ${em.length} |`);
  L(
    `| culture_detail | ${b.all.length} | ${JSON.stringify(count(b.all, (x) => x.detail.culture_type))} |`
  );
  L(
    `| policy_source | ${b.all.length} | ${JSON.stringify(count(b.all, (x) => x.source.source_type))} |`
  );
  L(
    `| policy_region | ${b.all.flatMap((x) => x.regions).length} | ${JSON.stringify(
      count(
        b.all.flatMap((x) => x.regions),
        (r) => r.region_code
      )
    )} |`
  );
  L();
  L(`- 정책 대분류: ${JSON.stringify(count(cm, (x) => x.policy._category_name))}`);
  L(
    `- culture.csv 제외 ${b.cultureSkipped.length}건 (문화·공간이 아닌 세부분류): ${b.cultureSkipped.map((r) => r.data_id).join(', ')}`
  );
  L(`- events.csv 제외 ${b.eventsSkipped}건 (종료일 ${opt.today} 이전 또는 종료일 없음)`);
  L(
    `- 장소 좌표 있음 ${b.placeRows.filter((p) => p.lat != null).length} / 없음 ${b.placeRows.filter((p) => p.lat == null).length}; coord_status ${JSON.stringify(count(b.placeRows, (p) => p.coord_status))}`
  );
  L(
    `- 행사 장소 연결(place_id) ${em.filter((x) => x.detail.place_id).length}건, venue_text만 ${em.filter((x) => !x.detail.place_id && x.detail.venue_text).length}건, 장소 없음 ${em.filter((x) => !x.detail.place_id && !x.detail.venue_text).length}건`
  );
  L(
    `- raw_data 출처: 정책 ${JSON.stringify(count(cm, (x) => x.meta.rawFrom))}, 행사 ${JSON.stringify(count(em, (x) => x.meta.rawFrom))}`
  );
  L(
    `- 자격 검증(eligibility_verified=true) ${cm.filter((x) => x.policy.eligibility_verified).length} / ${cm.length}`
  );
  L();
  L('## 검증 문제');
  L(b.issues.length ? b.issues.map((s) => `- ${s}`).join('\n') : '- 없음');
  L();
  L('## 정책 33건 확인용');
  L(
    '| data_id | 대분류 | culture_type | 신청기간 | 상시 | 운영기간 | 지원금액(원) | 준비물 | 조건 수 |'
  );
  L('|---|---|---|---|---|---|---|---|---|');
  for (const { policy: p, detail: d, meta } of cm) {
    const docs = p.required_documents == null ? 'NULL' : `${p.required_documents.length}개`;
    const cond = p.eligibility_conditions.all.length + p.eligibility_conditions.exclude.length;
    L(
      `| ${meta.id} ${p.title.slice(0, 18)} | ${p._category_name} | ${d.culture_type} | ${p.application_start_date ?? '-'}~${p.application_end_date ?? '-'} | ${p.is_always_open ? 'Y' : ''} | ${d.event_start_at?.slice(0, 10) ?? '-'}~${d.event_end_at?.slice(0, 10) ?? '-'} | ${d.support_amount ?? 'NULL'} | ${docs} | ${cond} |`
    );
  }
  L();
  L('## 준비물 분리 결과');
  for (const { policy: p, meta } of cm) {
    if (!p.required_documents) continue;
    L(
      `- ${meta.id}: ${p.required_documents.map((d) => `${d.name}${d.required ? '' : '(선택)'}${d.confirmed ? '' : '(확인필요)'}`).join(' / ') || '(서류 없음)'}`
    );
  }
  L();
  L('## 행사 76건 장르·지역');
  L(`- 장르: ${JSON.stringify(count(em, (x) => x.detail.genre))}`);
  L(`- 지역: ${JSON.stringify(count(em, (x) => x.regions[0].region_code))}`);
  L(
    `- 관람료: 무료 ${em.filter((x) => x.detail.price === 0).length}, 유료 ${em.filter((x) => x.detail.price > 0).length}, NULL ${em.filter((x) => x.detail.price == null).length}`
  );
  fs.writeFileSync(path.join(opt.outDir, 'summary.md'), lines.join('\n'));
  return lines.join('\n');
}

// ---------------------------------------------------------------------
// 적재
// ---------------------------------------------------------------------
const chunk = (arr, n = 100) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function connect() {
  await import('dotenv/config');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('backend/.env 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 없습니다.');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// 읽기만 하는 사전 점검. 문제가 있으면 throw.
async function precheck(db, b) {
  must(
    await db.from('place').select('place_id').limit(1),
    'place 테이블 확인(마이그레이션을 먼저 실행하세요)'
  );
  must(
    await db
      .from('culture_detail')
      .select('genre, price_text, support_amount, support_amount_text')
      .limit(1),
    'culture_detail 새 컬럼 확인(마이그레이션을 먼저 실행하세요)'
  );

  const cats = must(
    await db.from('policy_category').select('category_id, category_name'),
    'policy_category 조회'
  );
  const catId = Object.fromEntries(cats.map((c) => [c.category_name, c.category_id]));
  for (const n of new Set(b.all.map((x) => x.policy._category_name)))
    if (!catId[n]) throw new Error(`policy_category 에 '${n}' 이 없습니다.`);

  const needRegions = [
    ...new Set([
      ...b.all.flatMap((x) => x.regions.map((r) => r.region_code)),
      ...b.placeRows.map((p) => p.region_code),
    ]),
  ];
  const regions = must(
    await db.from('region').select('region_code').in('region_code', needRegions),
    'region 조회'
  );
  const missing = needRegions.filter((c) => !regions.some((r) => r.region_code === c));
  if (missing.length) throw new Error(`region 테이블에 없는 코드: ${missing.join(', ')}`);

  // 다른 사람이 같은 external_id 로 넣은 출처가 있으면 덮어쓰지 않고 멈춘다.
  const expected = new Map(
    b.all.map((x) => [`${x.source.source_type}:${x.source.external_id}`, x.policy.policy_id])
  );
  const conflicts = [];
  for (const part of chunk(b.all.map((x) => x.source.external_id))) {
    const rows = must(
      await db
        .from('policy_source')
        .select('policy_id, source_type, external_id')
        .in('external_id', part),
      'policy_source 조회'
    );
    for (const r of rows) {
      const want = expected.get(`${r.source_type}:${r.external_id}`);
      if (want && want !== r.policy_id) conflicts.push(`${r.source_type}:${r.external_id}`);
    }
  }
  if (conflicts.length)
    throw new Error(`다른 정책에 연결된 출처 키가 있어 중단: ${conflicts.join(', ')}`);

  return catId;
}

// 내 행이 DB에 몇 건 있는지 (재실행이면 갱신 대상)
async function countMine(db, b) {
  const cnt = async (table, col, vals) => {
    let n = 0;
    for (const part of chunk(vals)) {
      const { count, error } = await db
        .from(table)
        .select(col, { count: 'exact', head: true })
        .in(col, part);
      if (error) throw new Error(`${table} 건수 확인: ${error.message}`);
      n += count;
    }
    return n;
  };
  const ids = b.all.map((x) => x.policy.policy_id);
  return {
    place: await cnt(
      'place',
      'place_id',
      b.placeRows.map((p) => p.place_id)
    ),
    policy: await cnt('policy', 'policy_id', ids),
    culture_detail: await cnt('culture_detail', 'policy_id', ids),
    policy_source: await cnt('policy_source', 'policy_id', ids),
    policy_region: await cnt('policy_region', 'policy_id', ids),
  };
}

// DB의 place 와 새로 만든 행을 비교한다. 좌표는 값 대신 "바뀜/생김/없어짐"만 보여 준다.
async function diffPlaces(db, b) {
  const cur = new Map();
  for (const part of chunk(b.placeRows.map((p) => p.place_id))) {
    const rows = must(
      await db
        .from('place')
        .select('place_id, place_type, coord_status, lat, lng')
        .in('place_id', part),
      'place 조회'
    );
    for (const r of rows) cur.set(r.place_id, r);
  }
  const out = [];
  for (const p of b.placeRows) {
    const c = cur.get(p.place_id);
    if (!c) {
      out.push(`${p.place_key} ${p.name}: 새 장소`);
      continue;
    }
    const d = [];
    if (c.place_type !== p.place_type) d.push(`place_type ${c.place_type} → ${p.place_type}`);
    if (c.coord_status !== p.coord_status)
      d.push(`coord_status ${c.coord_status} → ${p.coord_status}`);
    const had = c.lat != null;
    const has = p.lat != null;
    if (!had && has) d.push('좌표 생김');
    else if (had && !has) d.push('좌표 없어짐');
    else if (had && (Math.abs(c.lat - p.lat) > 1e-7 || Math.abs(c.lng - p.lng) > 1e-7))
      d.push('좌표 바뀜');
    if (d.length) out.push(`${p.place_key} ${p.name}: ${d.join(', ')}`);
  }
  return out;
}

async function apply(db, b, catId, only) {
  // 같은 policy_id/place_id 로 다시 실행하면 갱신된다
  const now = new Date().toISOString();
  for (const part of chunk(b.placeRows.map((p) => ({ ...p, updated_at: now }))))
    must(await db.from('place').upsert(part, { onConflict: 'place_id' }), 'place 적재');
  if (only === 'place') return;

  const policies = b.all.map(({ policy: { _category_name, ...p } }) => ({
    ...p,
    category_id: catId[_category_name],
    updated_at: now,
  }));
  for (const part of chunk(policies))
    must(await db.from('policy').upsert(part, { onConflict: 'policy_id' }), 'policy 적재');
  for (const part of chunk(b.all.map((x) => x.detail)))
    must(
      await db.from('culture_detail').upsert(part, { onConflict: 'policy_id' }),
      'culture_detail 적재'
    );
  for (const part of chunk(b.all.map((x) => x.source)))
    must(
      await db.from('policy_source').upsert(part, { onConflict: 'source_type,external_id' }),
      'policy_source 적재'
    );

  const ids = b.all.map((x) => x.policy.policy_id);
  for (const part of chunk(ids))
    must(await db.from('policy_region').delete().in('policy_id', part), 'policy_region 정리');
  for (const part of chunk(b.all.flatMap((x) => x.regions)))
    must(await db.from('policy_region').insert(part), 'policy_region 적재');
}

const opt = args();
const b = build(opt);
const summary = writePreview(opt, b);
console.log(summary.split('\n## 정책 33건')[0]);
console.log(`\n미리보기: ${opt.outDir}`);

if (b.issues.length) {
  console.error(`\n검증 문제 ${b.issues.length}건이 있어 적재하지 않습니다.`);
  process.exit(1);
}
if (opt.only && opt.only !== 'place') {
  console.error(`\n--only 는 place 만 지원합니다: ${opt.only}`);
  process.exit(1);
}
if (opt.apply || opt.check) {
  try {
    const db = await connect();
    const catId = await precheck(db, b);
    console.log('\n사전 점검 통과 (마이그레이션 적용됨, 분류·지역 코드 있음, 출처 키 충돌 없음)');
    console.log('DB에 이미 있는 내 행:', await countMine(db, b));
    const diff = await diffPlaces(db, b);
    console.log(
      `\nDB와 달라지는 장소 ${diff.length}곳${diff.length ? ':\n  ' + diff.join('\n  ') : ''}`
    );
    if (opt.only) console.log(`(--only ${opt.only}: place 만 갱신, 정책·행사는 건드리지 않음)`);
    if (opt.apply) {
      await apply(db, b, catId, opt.only);
      console.log('\n적재 완료. DB 건수:', await countMine(db, b));
    } else {
      console.log('\n--check 라 DB에는 쓰지 않았습니다. 적재하려면 --apply');
    }
  } catch (e) {
    console.error(`\n중단: ${e.message}`);
    process.exitCode = 1; // exit() 로 끊으면 Windows 에서 열린 연결 때문에 Assertion 경고가 난다
  }
} else {
  console.log('\ndry-run 이라 DB에는 쓰지 않았습니다. 연결 점검은 --check, 적재는 --apply');
}
