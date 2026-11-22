// 정기 작업 예약. 공용 DB 에 쓰는 작업이라 .env 에서 켠 서버 한 곳에서만 돈다
// (팀원 PC 마다 돌면 같은 DB 에 여러 번 쓰게 된다).
import cron from 'node-cron';
import { runCultureSync } from './culture/syncCulture.js';
import { runDueAlarms } from './alarms.js';
import { runContentNotifications } from './contentNotifications.js';
import { runPolicySync } from './policySync/syncPolicies.js';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEmbeddings } from '../../scripts/ai/buildEmbeddings.mjs';
import { registrationCleanup } from '../services/registration-runtime.service.js';
import { runApplicationResults } from '../services/application-results.service.js';

export function startJobs() {
  if (process.env.MY_RESULT_JOB_ENABLED !== 'false')
    cron.schedule(
      '1 0 * * *',
      async () => {
        try {
          await runApplicationResults();
        } catch {
          console.error('[신청 결과] 발표일 전환 재시도 확인 필요');
        }
      },
      { name: 'application-results', timezone: 'Asia/Seoul', noOverlap: true }
    );
  // Only requested withdrawals retry automatically; abandoned signup cleanup remains opt-in.
  if (process.env.WITHDRAWAL_JOB_ENABLED !== 'false')
    cron.schedule(
      '*/5 * * * *',
      async () => {
        try {
          await registrationCleanup.runWithdrawals();
        } catch {
          console.error('[탈퇴] 삭제 재시도 확인 필요');
        }
      },
      { name: 'withdrawal-cleanup', timezone: 'Asia/Seoul', noOverlap: true }
    );
  if (process.env.REGISTRATION_CLEANUP_ENABLED === 'true')
    cron.schedule(
      '*/5 * * * *',
      async () => {
        try {
          const result = await registrationCleanup.runBatch();
          if (result.removed) console.log(`[가입 요청 정리] ${result.removed}건 완료`);
        } catch {
          console.error('[가입 요청 정리] DB 설정 또는 삭제 재시도 상태 확인 필요');
        }
      },
      { name: 'registration-cleanup', timezone: 'Asia/Seoul', noOverlap: true }
    );
  startAlarmJob();
  startEmbeddingJob();
  startPolicySyncJob();
  startContentNotificationJob();
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

// AI 비서 벡터 검색 조각: 매일 새벽 정책이 바뀐 조각만 다시 임베딩한다 (AI-REQ-COM-007)
function startEmbeddingJob() {
  if (process.env.EMBEDDING_JOB_ENABLED !== 'true') return;
  cron.schedule(
    '30 3 * * *',
    async () => {
      try {
        const r = await buildEmbeddings({ apply: true, log: () => {} });
        if (r.changed || r.stale) console.log(`[벡터 검색] 조각 갱신 ${r.changed}건, 삭제 ${r.stale}건`);
      } catch (e) {
        console.error(`[벡터 검색] 갱신 중단: ${e.message}`);
      }
    },
    { name: 'ai-embeddings', timezone: 'Asia/Seoul', noOverlap: true }
  );
  console.log('AI 비서 벡터 조각 매일 03:30 갱신 예약');
}

// 정책 매일 수집 (UC-COM-003, FR-COM-006): 주거(housing-sync)와 취업·진로·장학·금융(온통청년 API)을 서버가 매일 09:00에 수집한다.
// 문화·행사·장소는 CULTURE_SYNC_* 작업이 따로 맡는다. 같은 DB 에 쓰는 작업이라 한 서버에서만 켜고,
// 켜면 PC 작업 스케줄러(SWEProject-Housing-Daily)는 꺼야 한다. 취업·금융은 backend/.env 의 YOUTHCENTER_API_KEY 가 필요하다.
function startPolicySyncJob() {
  if (process.env.POLICY_SYNC_JOB_ENABLED !== 'true') return;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const housing = () =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [path.join(root, 'backend/scripts/housing-sync/cli.cjs'), 'daily'],
        { cwd: root, timeout: 4 * 3600_000, maxBuffer: 20 * 1024 * 1024 },
        (error, stdout) => {
          if (error) console.error(`[주거 정책 수집] 실패: ${error.message.split(String.fromCharCode(10))[0]}`);
          else console.log(`[주거 정책 수집] 완료: ${String(stdout).trim().split(String.fromCharCode(10)).pop().slice(0, 200)}`);
          resolve();
        }
      );
    });
  cron.schedule(
    process.env.POLICY_SYNC_CRON || '0 9 * * *',
    async () => {
      await housing();
      try {
        for (const r of await runPolicySync())
          console.log(`[정책 수집:${r.domain}] 받음 ${r.fetched}건, 새로 넣음 ${r.added}건, 실패 ${r.failed}건`);
      } catch (e) {
        console.error(`[정책 수집] 중단: ${e.message}`);
      }
    },
    { name: 'policy-sync', timezone: 'Asia/Seoul', noOverlap: true }
  );
  console.log('정책 매일 수집 예약 (주거·취업·진로·장학·금융)');
}

// 새 소식 알림 (FR-MY-012~015): 수집이 끝난 뒤(기본 10:30) 새 정책·문화행사·시설을 알림 센터에 넣는다
function startContentNotificationJob() {
  if (process.env.NOTIFY_JOB_ENABLED !== 'true') return;
  cron.schedule(
    process.env.NOTIFY_CRON || '30 10 * * *',
    async () => {
      try {
        const r = await runContentNotifications();
        console.log(`[새 소식 알림] 사용자 ${r.users}명, 발송 ${r.sent}건, 건너뜀 ${r.skipped}명, 실패 ${r.failed}건`);
      } catch (e) {
        console.error(`[새 소식 알림] 중단: ${e.message}`);
      }
    },
    { name: 'content-notifications', timezone: 'Asia/Seoul', noOverlap: true }
  );
  console.log('새 소식 알림 매일 10:30 예약');
}

// 정책 알림: 1분마다 때가 된 알림을 알림 센터에 넣는다 (캘린더 FR-C06~C12)
function startAlarmJob() {
  if (process.env.ALARM_JOB_ENABLED !== 'true') return;
  cron.schedule(
    '* * * * *',
    async () => {
      try {
        const r = await runDueAlarms();
        if (r.due) console.log(`[정책 알림] 대상 ${r.due}건, 발송 ${r.sent}건`);
      } catch (e) {
        console.error(`[정책 알림] 중단: ${e.message}`);
      }
    },
    { name: 'policy-alarms', timezone: 'Asia/Seoul', noOverlap: true }
  );
  console.log('정책 알림 1분 주기 확인 예약');
}
