'use strict';
const numericFields=['monthly_amount','total_amount_max','support_months','deposit_max','monthly_rent_max','loan_limit','interest_rate','supply_units','exclusive_area_max'];
const integerFields=new Set(numericFields.filter(k=>!['interest_rate','exclusive_area_max'].includes(k)));
function validateHousingDetail(detail,contexts={},options={}){
 for(const k of numericFields){const v=detail[k];if(v===null||v===undefined)continue;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||(v===0&&k!=='interest_rate')||(integerFields.has(k)&&!Number.isSafeInteger(v)))throw Error('Invalid housing numeric value; unknown values must stay NULL: '+k);
  const c=contexts[k];if(options.requireContext||c||v===0){if(!c||!['CONFIRMED','CONDITIONAL'].includes(c.status)||c.value!==v||!c.conditions||!Array.isArray(c.source_urls)||!c.source_urls.length||!c.unit||!c.scope)throw Error('Missing verified housing value context: '+k);for(const u of c.source_urls)if(!/^https:\/\//.test(u))throw Error('Invalid housing source URL');}
 }
 if(contexts.exclusive_area_max?.meaning==='supply_area')throw Error('Supply area cannot be mapped to eligibility area cap');
}
module.exports={validateHousingDetail,numericFields};
