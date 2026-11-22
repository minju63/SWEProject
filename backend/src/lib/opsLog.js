// 운영 로그 (NFR-COM-005, NFR-COM-027): AI 기능이 성공했는지 실패했는지만 DB(ai_execution_log)에 남기고, 30일이 지나면 지운다.
// 질문 원문·사용자 식별 정보·위치는 남기지 않는다. 저장이 실패해도 서비스 동작에는 영향이 없다.
import { supabase } from './supabase.js';

export const LOG_RETENTION_DAYS = 30;

export function logAi({ feature, ok = true, errorCode = null, policyId = null }) {
  supabase
    .from('ai_execution_log')
    .insert({ feature_type: String(feature).slice(0, 60), status: ok ? '성공' : '실패', error_code: errorCode ? String(errorCode).slice(0, 60) : null, policy_id: policyId })
    .then(({ error }) => {
      if (error) console.warn('[운영 로그] 저장 실패:', error.message);
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
