import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { ok } from "../utils/response.js";
const router = Router();
router.get("/policy-catalog", async (_req, res) => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("policy")
      .select(
        "policy_id,title,collection_domain,item_type,target_summary,support_content,income_condition,min_age,max_age,eligibility_conditions,application_start_date,application_end_date,is_always_open,application_method,application_url,official_url,application_process,required_documents,eligibility_verified,last_collected_at,policy_category(category_name),policy_region(region_code),policy_subcategory_map(policy_subcategory(subcategory_name)),housing_detail(*),job_detail(*),finance_detail(*),culture_detail(*)",
      )
      .order("policy_id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  const statuses = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { data, error } = await supabase
      .from("v_policy_status")
      .select("policy_id,recruitment_status,d_day")
      .in(
        "policy_id",
        rows.slice(offset, offset + 100).map((p) => p.policy_id),
      );
    if (error) throw error;
    statuses.push(...data);
  }
  const byId = new Map(statuses.map((s) => [s.policy_id, s]));
  const items = rows.map((p) => ({ ...p, ...byId.get(p.policy_id) }));
  ok(res, {
    policies: items.filter((p) => p.item_type === "POLICY"),
    events: items.filter((p) => p.item_type === "EVENT"),
    totalCount: items.length,
  });
});
export default router;
