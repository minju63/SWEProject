import { evaluateConditions } from '../../../shared/eligibility-engine.mjs';

export const RESULT={ELIGIBLE:'ELIGIBLE',CHECK:'CHECK',INELIGIBLE:'INELIGIBLE'};
function ageFrom(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [year,month,day]=date.split('-').map(Number),[ny,nm,nd]=today.split('-').map(Number);
  return ny-year-(nm<month||nm===month&&nd<day?1:0);
}
export function judge(policy,profile){
  const p=profile||{};
  return evaluateConditions(policy,{
    age:ageFrom(p.birth_date),
    birth_year:/^\d{4}-\d{2}-\d{2}$/.test(p.birth_date||'')?Number(p.birth_date.slice(0,4)):null,
    region_code:p.region_code,
    final_education:p.final_education,
    current_status:p.current_status,
    housing_type:p.housing_type,
    household_type:p.household_type,
    lives_separately:p.lives_separately,
    marital_status:p.marital_status==='예비신혼부부'?'미혼':p.marital_status==='신혼부부'?'기혼':p.marital_status,
    home_ownership:p.home_ownership,
    household_role:p.household_role,
    housing_benefit_status:p.housing_benefit_status,
    special_targets:p.special_targets,
  });
}
