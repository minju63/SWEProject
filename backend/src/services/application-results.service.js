import { supabase } from '../lib/supabase.js';
import { readPersonal, changePersonal, koreaToday } from './my-workspace.service.js';
import { registrationClient } from './registration-auth.service.js';
export const manualResultDue = (item, today) =>
  item.stage === '신청 완료' &&
  !!item.expectedResultDate &&
  item.expectedResultDate !== '미정' &&
  item.expectedResultDate <= today;
export async function reconcileStoredResults(
  userId = null,
  { db = supabase, today = koreaToday() } = {}
) {
  let query = db
    .from('user_application')
    .update({ stage: 'RESULT', apply_status: 'NEED_CHECK', updated_at: new Date().toISOString() })
    .eq('stage', 'APPLIED')
    .lte('expected_result_date', today);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}
export async function reconcileManualResults(
  userId,
  { read = readPersonal, change = changePersonal, today = koreaToday() } = {}
) {
  const value = await read(userId);
  if (!value.manual.some((item) => manualResultDue(item, today))) return;
  await change(userId, (state) => {
    state.manual = state.manual.map((item) =>
      manualResultDue(item, today)
        ? { ...item, stage: '결과 확인', reviewStatus: '결과 확인 필요' }
        : item
    );
  });
}
export async function runApplicationResults() {
  await reconcileStoredResults();
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await registrationClient().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    for (const user of data.users)
      if (!user.app_metadata?.deletion_pending) await reconcileManualResults(user.id);
    if (data.users.length < 100) return;
  }
  throw Error('RESULT_RECONCILIATION_LIMIT');
}
