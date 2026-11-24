// 운영 로그 (NFR-COM-005, NFR-COM-026, NFR-COM-027)
// - AI 로그(ai_execution_log): 기능 종류·성공/실패·오류 코드·걸린 시간(ms)·AI 대신 규칙/DB 결과로 대체했는지만 남긴다.
//   질문 원문·사용자 식별 정보·위치는 남기지 않는다.
// - 보안 감사 로그(security_audit_log): 운영자·배치가 정책·장소 데이터를 바꾼 작업의 작업자·시각·대상을 남긴다.
//   (사용자의 맞춤정보·찜·신청현황 내용은 기록하지 않는다)
// 저장이 실패해도 서비스 동작에는 영향이 없다.
import { supabase } from './supabase.js';

export const LOG_RETENTION_DAYS = 30;

// duration_ms·fallback 컬럼은 migrations/20261124_ai_log_latency.sql 실행 뒤에 있다.
// 아직 없으면 예전 컬럼만으로 기록하고, 5분 뒤에 다시 시도한다.
let extendedUnavailableUntil = 0;
const warned = new Set();
const warnOnce = (key, message) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
};

// 시험에서 기억해 둔 상태를 비울 때 쓴다
export function resetLogState() {
  extendedUnavailableUntil = 0;
  warned.clear();
}

// AI 호출 오류를 로그에 남길 짧은 코드로 바꾼다 (오류 내용·질문은 남기지 않는다)
export function aiErrorCode(error) {
  if (!error) return null;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'AI_TIMEOUT';
  const msg = String(error.message ?? '');
  if (/^[A-Z][A-Z0-9_]{2,40}$/.test(msg)) return msg;
  return 'AI_ERROR';
}

export function logAi({
  feature,
  ok = true,
  errorCode = null,
  policyId = null,
  comparePolicyId = null,
  durationMs = null,
  fallback = false,
}) {
  const base = {
    feature_type: String(feature).slice(0, 60),
    status: ok ? '성공' : '실패',
    error_code: errorCode ? String(errorCode).slice(0, 60) : null,
    policy_id: policyId,
    compare_policy_id: comparePolicyId,
  };
  const extended = {
    ...base,
    duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
    fallback: Boolean(fallback),
  };
  const useExtended = Date.now() >= extendedUnavailableUntil;
  supabase
    .from('ai_execution_log')
    .insert(useExtended ? extended : base)
    .then(({ error }) => {
      if (!error) return;
      if (useExtended && /duration_ms|fallback/.test(error.message ?? '')) {
        extendedUnavailableUntil = Date.now() + 5 * 60 * 1000;
        warnOnce('ai-log-columns', '[운영 로그] duration_ms·fallback 컬럼이 아직 없어요(20261124_ai_log_latency.sql 실행 필요). 시간·대체 여부 없이 기록합니다.');
        return supabase.from('ai_execution_log').insert(base).then(({ error: e2 }) => {
          if (e2) console.warn('[운영 로그] 저장 실패:', e2.message);
        });
      }
      console.warn('[운영 로그] 저장 실패:', error.message);
    });
}

// AI 호출 하나를 감싸 걸린 시간과 대체 여부를 기록한다. 결과·오류는 그대로 돌려준다.
// run() 이 { fallback: true } 같은 값을 알려 주려면 isFallback 으로 판단한다.
export async function withAiLog({ feature, policyId = null, comparePolicyId = null }, run, isFallback = () => false) {
  const startedAt = Date.now();
  try {
    const result = await run();
    logAi({
      feature,
      ok: true,
      policyId,
      comparePolicyId,
      durationMs: Date.now() - startedAt,
      fallback: isFallback(result),
    });
    return result;
  } catch (error) {
    logAi({
      feature,
      ok: false,
      errorCode: aiErrorCode(error),
      policyId,
      comparePolicyId,
      durationMs: Date.now() - startedAt,
      fallback: true,
    });
    throw error;
  }
}

// 운영자·배치가 데이터를 바꾼 작업을 남긴다 (NFR-COM-026). actorUserId 가 없으면 시스템(배치) 작업이다.
// 약속을 돌려주므로 곧바로 끝나는 명령줄 작업은 기다릴 수 있다(실패해도 던지지 않는다).
export function logAudit({ actorUserId = null, action, table = null, key = null, ok = true, errorCode = null }) {
  return supabase
    .from('security_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action_type: String(action).slice(0, 60),
      target_table: table ? String(table).slice(0, 60) : null,
      target_record_key: key ? String(key).slice(0, 120) : null,
      result: ok ? '성공' : '실패',
      error_code: errorCode ? String(errorCode).slice(0, 60) : null,
    })
    .then(({ error }) => {
      if (error) console.warn('[감사 로그] 저장 실패:', error.message);
    });
}

// 보관 기간이 지난 운영 로그를 지운다. 지운 건수를 돌려준다
export async function purgeOldLogs(now = new Date()) {
  const before = new Date(now.getTime() - LOG_RETENTION_DAYS * 86400000).toISOString();
  const removed = {};
  for (const [table, column] of [
    ['ai_execution_log', 'created_at'],
    ['security_audit_log', 'occurred_at'],
  ]) {
    const { data, error } = await supabase.from(table).delete().lt(column, before).select('*', { count: 'exact', head: false });
    if (error) throw new Error(`${table} 정리 실패: ${error.message}`);
    removed[table] = data?.length ?? 0;
  }
  return removed;
}
