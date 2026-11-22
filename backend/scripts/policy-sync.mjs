// 취업·진로, 장학·금융 정책을 온통청년 API 에서 받아 새 정책만 DB 에 넣는다 (UC-COM-003).
//   node scripts/policy-sync.mjs              ← 미리보기: DB 에 쓰지 않고 새로 넣을 정책만 보여 줌
//   node scripts/policy-sync.mjs --apply      ← 새 정책을 DB 에 넣음 (기존 정책은 건드리지 않음)
//   node scripts/policy-sync.mjs --domain JOB ← 한 분야만 (JOB 또는 FINANCE)
// backend/.env 에 YOUTHCENTER_API_KEY 가 있어야 한다.
import 'dotenv/config';
import { runPolicySync } from '../src/jobs/policySync/syncPolicies.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const at = args.indexOf('--domain');
const domains = at >= 0 ? [args[at + 1]] : undefined;

runPolicySync({ apply, domains })
  .then((report) => {
    console.log(apply ? '== 적재 결과 ==' : '== 미리보기 (DB 변경 없음) ==');
    for (const r of report) {
      console.log(`\n[${r.domain}] 받음 ${r.fetched}건 · 새로 ${apply ? '넣음' : '넣을 것'} ${r.added}건 · 실패 ${r.failed}건${r.error ? ` · ${r.error}` : ''}`);
      console.log(`  건너뜀: ${JSON.stringify(r.skipped)}`);
      for (const t of r.titles.slice(0, 20)) console.log(`  + ${t}`);
      if (r.titles.length > 20) console.log(`  … 외 ${r.titles.length - 20}건`);
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
