// 지도 장소 법정동(place.legal_dong) 처음 채우기. 미리보기 파일만 만들고 DB 에는 쓰지 않는다
//
// 실행 (backend 폴더에서):
//   node scripts/culture/fillLegalDong.js            # 지도 대상(is_target) 장소, 1분 남짓
//   node scripts/culture/fillLegalDong.js --all      # 부산 장소 전체 (약 1,000곳, 5분 남짓)
//   --out <폴더>   결과 폴더 (기본: 저장소 밖 ../../data/legal_dong)
// 결과:
//   review.csv  장소마다 검색어, 행안부 판정, 법정동, 원본 주소에 적힌 동, 바꿀 값
//   apply.sql   legal_dong 과 주소 보정(ADDRESS_FIX)을 넣는 SQL.
//               supabase/migrations/20261119_place_legal_dong.sql 을 먼저 실행한 뒤 SQL Editor 에서 실행한다
// 법정동은 행안부 도로명주소 검색 API(DORO_KEY)의 emdNm 을 쓰고, 행안부가 정하지 못하면 원본 주소에 적힌 동을 쓴다.
// 이후에는 하루 1회 갱신의 좌표 검증(coords.js)이 같은 검색으로 고친다.
// 카카오 결과는 저장하지 않는다. 좌표는 읽지도 출력하지도 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../../src/lib/supabase.js';
import { jusoDong, newJusoState } from '../../src/jobs/culture/coords.js';

const argv = process.argv.slice(2);
const get = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const all = argv.includes('--all');
const outDir = path.resolve(get('--out') ?? '../../data/legal_dong');

// 원본 주소로는 행안부 검색이 안 되는 장소 (2026-11-19 확인).
// 카카오 지도 검색으로 실제 위치를 찾았고, 고친 주소는 행안부 검색에서 1건만 일치할 때만 쓴다
const ADDRESS_FIX = {
  // 갤러리 인터페이스
  'd1d6bea5-4a8c-54d4-9322-29b80707fbb8': {
    query: '부산광역시 부산진구 신천대로220번길 65',
    suffix: ' 동문굿모닝힐',
    note: '원본 주소 "부산진구 서면 동문굿모닝힐"에 도로명과 번지가 없음 (실제 위치 부암동)',
  },
  // 정준호 갤러리
  '216b80c5-ce7d-5505-92e1-fa605540147e': {
    query: '부산광역시 부산진구 중앙대로666번길 50',
    suffix: ' E동 1층',
    note: '원본 도로명 오타 (중앙대로666길 → 중앙대로666번길)',
  },
};

const MISSING_COLUMN = '42703';
const DONG = /^[가-힣\d]+(?:동|가|리)$/;

// 원본 주소에 적힌 동: '... 79 (부전동)', '... 부산진구 부전동 512-3'
function statedDong(...addresses) {
  for (const a of addresses) {
    const m =
      String(a ?? '').match(/\(([가-힣\d]+동)[,\s)]/) ??
      String(a ?? '').match(/[구군]\s+([가-힣\d]+동)\s/);
    if (m) return m[1];
  }
  return null;
}

async function loadPlaces() {
  const base =
    'place_id, place_key, name, address, road_address, jibun_address, is_target, region:region_code (region_name)';
  let withDong = true;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('place')
      .select(withDong ? `${base}, legal_dong` : base)
      .eq('is_active', true)
      .order('place_key')
      .range(from, from + 999);
    if (!all) q = q.eq('is_target', true);
    const { data, error } = await q;
    if (error?.code === MISSING_COLUMN && withDong) {
      withDong = false;
      from -= 1000;
      continue;
    }
    if (error) throw new Error(`place 조회: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return { rows, withDong };
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const sqlText = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const { rows, withDong } = await loadPlaces();
  console.log(`대상 ${rows.length}곳 (${all ? '부산 전체' : '지도 대상 is_target'})`);
  if (!withDong) console.log('  place.legal_dong 컬럼이 아직 없음: 현재 값 비교 없이 만든다');

  const state = newJusoState();
  const results = [];
  for (const [i, p] of rows.entries()) {
    const district = p.region?.region_name ?? null;
    const fix = ADDRESS_FIX[p.place_id];
    let r = await jusoDong(fix?.query ?? p.road_address ?? p.address, district, state);
    if (!r.dong && p.jibun_address) {
      const j = await jusoDong(p.jibun_address, district, state);
      if (j.dong) r = { ...j, verdict: `${j.verdict}(지번)` };
    }
    const stated = statedDong(p.address, p.road_address, p.jibun_address);
    const jusoOk = r.dong && DONG.test(r.dong);
    const dong = jusoOk ? r.dong : stated;
    const newAddress =
      fix && r.verdict === 'unique' && r.road ? `${r.road}${fix.suffix ?? ''}` : null;
    results.push({
      p,
      district,
      r,
      stated,
      dong,
      dongSource: jusoOk ? 'juso' : stated ? 'address_text' : '',
      fix,
      newAddress,
      newRoad: newAddress ? r.road : null,
    });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${rows.length}`);
  }

  const count = (f) => results.filter(f).length;
  const verdicts = {};
  for (const x of results) verdicts[x.r.verdict] = (verdicts[x.r.verdict] ?? 0) + 1;
  const mismatch = results.filter(
    (x) => x.stated && x.dongSource === 'juso' && x.stated !== x.dong
  );
  const changes = results.filter((x) => x.dong && (x.p.legal_dong ?? null) !== x.dong);
  const fixes = results.filter((x) => x.newAddress);
  const fixFailed = results.filter((x) => x.fix && !x.newAddress);
  const byDong = {};
  for (const x of results) {
    const k = `${x.district ?? '?'} ${x.dong ?? '(못 정함)'}`;
    byDong[k] = (byDong[k] ?? 0) + 1;
  }

  console.log(`행안부 호출 ${state.calls}회, 오류 ${state.errors}회`);
  console.log(
    `행안부 판정: ${Object.entries(verdicts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  );
  console.log(
    `법정동: 행안부 ${count((x) => x.dongSource === 'juso')}, 원본 주소 글자 ${count((x) => x.dongSource === 'address_text')}, 못 정함 ${count((x) => !x.dong)}`
  );
  console.log(`원본 주소에 적힌 동과 행안부 법정동이 다름: ${mismatch.length}`);
  for (const x of mismatch) console.log(`  ${x.p.name}: 주소 ${x.stated} / 행안부 ${x.dong}`);
  console.log(`바뀌는 legal_dong: ${changes.length}`);
  console.log(
    `주소 보정: ${fixes.length}${fixFailed.length ? ` (행안부 확인 실패 ${fixFailed.length})` : ''}`
  );
  for (const x of fixes) console.log(`  ${x.p.name}: ${x.p.address} → ${x.newAddress}`);
  for (const x of fixFailed) console.log(`  확인 실패 ${x.p.name}: ${x.r.verdict}`);
  for (const x of results.filter((y) => !y.dong))
    console.log(`  법정동 못 정함: ${x.p.name} (${x.p.address || '주소 없음'}, ${x.r.verdict})`);
  console.log(
    `동별: ${Object.entries(byDong)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  );

  fs.mkdirSync(outDir, { recursive: true });
  const header = [
    'place_key',
    'name',
    'district',
    'address',
    'keyword',
    'verdict',
    'juso_dong',
    'stated_dong',
    'current_legal_dong',
    'new_legal_dong',
    'dong_source',
    'new_address',
    'note',
  ];
  const csv = [header.join(',')]
    .concat(
      results.map((x) =>
        [
          x.p.place_key,
          x.p.name,
          x.district,
          x.p.address,
          x.r.keyword,
          x.r.verdict,
          x.r.dong,
          x.stated,
          x.p.legal_dong,
          x.dong,
          x.dongSource,
          x.newAddress,
          x.fix?.note,
        ]
          .map(csvCell)
          .join(',')
      )
    )
    .join('\n');
  fs.writeFileSync(path.join(outDir, 'review.csv'), `\uFEFF${csv}\n`);

  const values = results
    .filter((x) => x.dong)
    .map((x) => `  (${sqlText(x.p.place_id)}::uuid, ${sqlText(x.dong)})`)
    .join(',\n');
  const fixSql = fixes
    .map(
      (x) =>
        `-- ${x.p.name}: ${x.fix.note}\n` +
        `update place set address = ${sqlText(x.newAddress)}, road_address = ${sqlText(x.newRoad)}\n` +
        ` where place_id = ${sqlText(x.p.place_id)} and address = ${sqlText(x.p.address)};`
    )
    .join('\n');
  const undoSql = fixes
    .map(
      (x) =>
        `-- update place set address = ${sqlText(x.p.address)}, road_address = ${sqlText(x.p.road_address)} where place_id = ${sqlText(x.p.place_id)};`
    )
    .join('\n');
  const sql = `-- =====================================================================
-- 지도 장소 법정동 넣기 (scripts/culture/fillLegalDong.js, ${new Date().toISOString()})
-- 대상 ${rows.length}곳, 법정동 ${values ? results.filter((x) => x.dong).length : 0}곳, 주소 보정 ${fixes.length}곳
-- 먼저 supabase/migrations/20261119_place_legal_dong.sql 을 실행한다
-- =====================================================================
begin;

update place p set legal_dong = v.dong
from (values
${values}
) as v(place_id, dong)
where p.place_id = v.place_id and p.legal_dong is distinct from v.dong;

${fixSql}

commit;

-- 확인 (SQL Editor 는 마지막 결과만 보여 준다)
select count(*) as target,
       count(legal_dong) as with_dong,
       count(*) - count(legal_dong) as without_dong
from place where is_active and is_target;

-- 되돌리기 (필요할 때만 주석을 풀고 실행)
-- update place set legal_dong = null where legal_dong is not null;
${undoSql}
`;
  fs.writeFileSync(path.join(outDir, 'apply.sql'), sql);
  console.log(`결과: ${path.join(outDir, 'review.csv')}, ${path.join(outDir, 'apply.sql')}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
