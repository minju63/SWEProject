export type ConditionResult = Record<string, any> & {status:'SATISFIED'|'UNSATISFIED'|'UNKNOWN';children?:ConditionResult[]};
export const STATUS: {YES:'SATISFIED';NO:'UNSATISFIED';UNKNOWN:'UNKNOWN'};
export function evaluateConditions(policy:{eligibility_conditions?:Record<string, any>|null;eligibility_verified?:boolean},values?:Record<string, unknown>):{result:'ELIGIBLE'|'INELIGIBLE'|'CHECK';conditions:ConditionResult[]};
