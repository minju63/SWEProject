// 직접 검토한 결과(final.json)를 policy 에 반영한다. 기본은 미리보기(DB 변경 없음).
//   node scripts/eligibility/applyEligibilityDecisions.mjs <final.json>            ← 미리보기
//   node scripts/eligibility/applyEligibilityDecisions.mjs <final.json> --apply    ← 백업 후 반영
// 되돌리기: 같은 폴더에 만들어지는 backup-before-*.json 의 값을 다시 update 하면 된다 (--restore <backup.json>).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../../src/lib/supabase.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) throw new Error('결과 파일(final.json) 경로가 필요해요');
const APPLY = flags.includes('--apply');
const RESTORE = flags.includes('--restore');
const outDir = path.dirname(path.resolve(file));

if (RESTORE) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of rows) {
    const { error } = await supabase
      .from('policy')
      .update({
        eligibility_conditions: r.eligibility_conditions,
        eligibility_verified: r.eligibility_verified,
      })
      .eq('policy_id', r.policy_id);
    if (error) throw error;
  }
  console.log(`되돌리기 완료: ${rows.length}건`);
  process.exit(0);
}

const all = Object.values(JSON.parse(fs.readFileSync(file, 'utf8')));
const { data: current, error } = await supabase
  .from('policy')
  .select('policy_id, eligibility_conditions, eligibility_verified')
  .in(
    'policy_id',
    all.map((d) => d.policy_id)
  );
if (error) throw error;
// 이미 지워진 정책은 건너뛴다
const alive = new Set(current.map((c) => c.policy_id));
const decisions = all.filter((d) => alive.has(d.policy_id));
if (decisions.length !== all.length)
  console.log(`DB 에 없는 정책 ${all.length - decisions.length}건은 건너뜁니다 (삭제된 정책)`);

const verified = decisions.filter((d) => d.verified).length;
console.log(`대상 ${decisions.length}건 (true ${verified} / false ${decisions.length - verified})`);

if (!APPLY) {
  console.log('미리보기만 했어요. --apply 를 붙이면 백업 후 반영해요.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(outDir, `backup-before-${stamp}.json`);
fs.writeFileSync(backup, JSON.stringify(current, null, 1));
console.log(`백업 저장: ${backup}`);

let n = 0;
for (const d of decisions) {
  const { error: upErr } = await supabase
    .from('policy')
    .update({ eligibility_conditions: d.value, eligibility_verified: d.verified })
    .eq('policy_id', d.policy_id);
  if (upErr) throw new Error(`${d.title}: ${upErr.message}`);
  n += 1;
}
console.log(`DB 반영 완료: ${n}건`);
