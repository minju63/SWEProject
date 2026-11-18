import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { ok } from '../utils/response.js';
const router = Router();
router.get('/housing/policies', async (_req, res) => {
  const policies = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('policy')
      .select('policy_id,title,collection_domain,target_summary,support_content,income_condition,application_start_date,application_end_date,is_always_open,application_method,application_url,official_url,application_process,required_documents,eligibility_verified,last_collected_at,policy_region(region_code),policy_subcategory_map(policy_subcategory(subcategory_name)),housing_detail(*)')
      .eq('collection_domain', 'HOUSING').order('policy_id').range(offset, offset + 499);
    if (error) throw error;
    policies.push(...data);
    if (data.length < 500) break;
  }
  const { data: statuses, error } = await supabase.from('v_policy_status').select('policy_id,recruitment_status,d_day').in('policy_id', policies.map(p => p.policy_id));
  if (error) throw error;
  const byId = new Map(statuses.map(s => [s.policy_id, s]));
  ok(res, policies.map(p => ({ ...p, ...byId.get(p.policy_id) })));
});
export default router;
