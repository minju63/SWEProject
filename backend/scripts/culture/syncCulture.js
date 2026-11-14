// 지도 장소·행사 갱신을 직접 실행한다 (매일 자동 실행은 src/jobs/index.js)
//
// 실행 (backend 폴더에서):
//   npm run sync:culture                      # dry-run: 공공데이터를 받아 비교만 하고 DB 에는 쓰지 않는다
//   npm run sync:culture -- --apply           # 적재 (점검 통과 시 장소·행사, 항상 place_issues·수집 기록)
// 장소 전체(부산 약 1,000곳)의 좌표를 행안부 API 로 검증하므로 10분 남짓 걸린다.
//
// 옵션:
//   --today YYYY-MM-DD  이 날짜보다 먼저 끝난 행사는 제외 (기본: 오늘, KST)
//   --cache <dir>       공공데이터 대신 저장해 둔 응답으로 실행 (busan-culture-api/data 구조, API 장애 때 점검용)
//   --out <file>        결과 전체(문제 목록 포함)를 JSON 으로 저장
//   --list <n>          문제 종류마다 화면에 보일 개수 (기본 5)
// 좌표 값은 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { runCultureSync, kstToday } from '../../src/jobs/culture/syncCulture.js';
import { apiSource, cacheSource } from '../../src/jobs/culture/sources.js';

const argv = process.argv.slice(2);
const get = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const apply = argv.includes('--apply');
const cache = get('--cache');
const out = get('--out');
const listMax = Number(get('--list') ?? 5);

const ISSUE_LABEL = {
  source_differs: '처음 비교: 원본과 DB 값이 다름 (확인용)',
  source_changed: '원본 변경, 반영 안 함',
  place_missing_in_source: '원본에서 사라진 장소',
  new_place_candidate: '추가하지 못한 새 장소',
  merge_candidate: '병합 후보 (이름만 같거나 주소만 같음)',
  event_place_unmatched: '장소에 연결 못 한 행사 장소',
  event_missing_in_source: '목록 API 에서 사라진 행사',
  policy_unlinked: '온통청년 원본과 연결 못 한 정책',
  policy_missing_in_source: '온통청년에서 사라진 정책',
  policy_new_candidate: '새 문화 정책 후보',
  coord_review: '좌표 확인 필요',
  api_error: '외부 API 오류',
};

function print(r) {
  const L = (s = '') => console.log(s);
  L(
    `\n# 지도 장소·행사 갱신 ${r.apply ? '적재' : 'dry-run'} (기준일 ${r.today}, 원천 ${r.source})`
  );
  L(`결과: ${r.status}`);
  L(`\n## 장소`);
  L(`- 원본 건수: ${JSON.stringify(r.places.fetched)} (null = 받지 못함)`);
  L(`- 비교한 장소 ${r.places.compared}곳, 원본 기준값 저장·갱신 ${r.places.baselines}곳`);
  L(`- 자동 반영 ${r.places.changes.length}곳`);
  for (const c of r.places.changes.slice(0, 30))
    L(`  - ${c.place_key} ${c.name}: ${Object.keys(c.changes).join(', ')}`);
  const a = r.places.added;
  L(
    `- 새 장소 ${a.total}곳 ${JSON.stringify(a.byPrefix)}, 그중 서비스 지역 ${a.target}곳` +
      ` (이름·주소가 같아 합친 행 ${a.merged}, 부산 밖·구 미상 ${a.outsideBusan}, 유형 미상 ${a.noType})`
  );
  L(`  - 좌표 판정 ${JSON.stringify(a.coordStatus)}, 세부 유형 ${JSON.stringify(a.placeType)}`);
  for (const x of a.targetList)
    L(
      `  - ${x.place_key} ${x.name} (${x.place_type}, ${x.coord_status}, 요금 ${x.fee_type}${x.is_active ? '' : ', 사용 안 함'}): 지도 ${x.onMap ? '표시' : '안 나옴'}`
    );
  L(`\n## 좌표 검증 (행안부)`);
  if (r.coords.error) L(`- ${r.coords.error}`);
  else {
    L(`- 판정한 장소 ${r.coords.checked}곳, 바뀌는 장소 ${r.coords.changes.length}곳`);
    for (const c of r.coords.changes.slice(0, 50))
      L(`  - ${c.place_key} ${c.name}: ${c.fields.join(', ')}${c.status ? ` → ${c.status}` : ''}`);
  }
  L(`\n## 행사`);
  L(`- 목록: ${JSON.stringify(r.events.lists)}, 테마 ${r.events.themes ?? '받지 못함'}`);
  L(
    `- 진행 중·예정 ${r.events.live}건 (끝났거나 날짜가 비정상인 ${r.events.skippedEndedOrInvalid}건 제외)`
  );
  L(
    `- 상세: 오늘 받음 ${r.events.detail.api}, 지난번 응답 ${r.events.detail.previous}, 없음 ${r.events.detail.none}`
  );
  L(
    `- 장소 연결: 장소 번호 ${r.events.linked.byId}, 장소명 ${r.events.linked.byName}, 기존 연결 유지 ${r.events.linked.previous}, 연결 못 함 ${r.events.linked.none}`
  );
  L(`- 적재 대상: 새 행사 ${r.events.new}, 갱신 ${r.events.updated}`);
  L(`- 이미 있던 행사의 장소 연결 변경 ${r.events.relinked.length}건`);
  for (const x of r.events.relinked)
    L(`  - ${x.id} ${x.title}: ${x.linked ? '장소 연결됨' : '연결 끊김'}`);
  L(`\n## 문화 정책 (온통청년)`);
  const p = r.policies;
  if (p.linked) {
    L(
      `- 원본 ${p.fetched}건, DB 정책 연결: 정책 번호 ${p.linked.number}, 정책명 ${p.linked.title}, 연결 못 함 ${p.linked.unlinked}`
    );
    L(`- 자동 반영 ${p.changes.length}건`);
    for (const c of p.changes)
      L(`  - ${c.external_id} ${c.title}: ${Object.keys(c.changes).join(', ')}`);
  } else L('- 받지 못함');
  L(
    `\n## 무결성 점검 ${r.problems.length ? `실패 ${r.problems.length}건 → 장소·행사·정책 적재 안 함` : '통과'}`
  );
  for (const p of r.problems.slice(0, 20)) L(`- ${p}`);
  L(`\n## place_issues ${r.issueList.length}건`);
  for (const [type, n] of Object.entries(r.issues)) {
    L(`- ${ISSUE_LABEL[type] ?? type}: ${n}건`);
    for (const i of r.issueList.filter((x) => x.issue_type === type).slice(0, listMax))
      L(`  - ${i.ref_key} ${i.name ?? ''}: ${i.detail}`);
  }
  if (r.errors.length) {
    L(`\n## 공공데이터 오류 ${r.errors.length}건`);
    for (const e of r.errors) L(`- ${e.source_url}: ${e.error_message}`);
  }
  if (r.apply)
    L(`\n기록: collection_run ${r.runId}, place_issues ${JSON.stringify(r.issueChanges)}`);
  else if (r.missingMigrations.length)
    L(`\n참고: 아직 실행하지 않은 SQL ${r.missingMigrations.join(', ')} (적재 전에 실행 필요)`);
  if (!r.apply) L('\ndry-run 이라 DB 에는 쓰지 않았습니다. 적재는 --apply');
}

try {
  // 저장된 응답은 지난 수집분이라 오늘 수집한 것처럼 적재하면 수집일이 틀린다
  if (apply && cache) throw new Error('--cache 는 점검용이라 --apply 와 함께 쓸 수 없습니다.');
  const report = await runCultureSync({
    apply,
    today: get('--today') ?? kstToday(),
    source: cache ? cacheSource(path.resolve(cache)) : apiSource,
    log: (s) => console.log(s),
  });
  print(report);
  if (out) {
    fs.writeFileSync(path.resolve(out), JSON.stringify(report, null, 2));
    console.log(`\n저장: ${path.resolve(out)}`);
  }
  if (report.status === '실패') process.exitCode = 1;
} catch (e) {
  console.error(`\n중단: ${e.message}`);
  process.exitCode = 1; // exit() 로 끊으면 Windows 에서 열린 연결 때문에 경고가 난다
}
