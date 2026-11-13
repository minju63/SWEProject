// 정기 작업 예약. 공용 DB 에 쓰는 작업이라 .env 에서 켠 서버 한 곳에서만 돈다
// (팀원 PC 마다 돌면 같은 DB 에 여러 번 쓰게 된다).
import cron from 'node-cron';
import { runCultureSync } from './culture/syncCulture.js';

export function startJobs() {
  if (process.env.CULTURE_SYNC_ENABLED !== 'true') return;
  const schedule = process.env.CULTURE_SYNC_CRON || '0 4 * * *';
  cron.schedule(
    schedule,
    async () => {
      try {
        const r = await runCultureSync({ apply: true });
        console.log(
          `[문화 데이터 갱신] ${r.status}: 행사 ${r.events.live}건, 장소 변경 ${r.places.changes.length}곳, ` +
            `문제 ${r.issueList.length}건, 점검 실패 ${r.problems.length}건, API 오류 ${r.errors.length}건`
        );
      } catch (e) {
        console.error(`[문화 데이터 갱신] 중단: ${e.message}`);
      }
    },
    { name: 'culture-sync', timezone: 'Asia/Seoul', noOverlap: true }
  );
  console.log(`문화 데이터 하루 1회 갱신 예약: "${schedule}" (Asia/Seoul)`);
}
