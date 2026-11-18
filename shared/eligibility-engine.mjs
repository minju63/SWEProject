// One contract for API and browser. A verified flag never supplies missing facts.
export const STATUS = {YES:'SATISFIED', NO:'UNSATISFIED', UNKNOWN:'UNKNOWN'};
export function evaluateConditions(policy, values = {}) {
  const rules=policy.eligibility_conditions||{};
  const unknown=(node,reason)=>({...node,status:STATUS.UNKNOWN,reason});
  function combine(children,operator){
    if(!children.length)return STATUS.UNKNOWN;
    const states=children.map(c=>c.status);
    if(operator==='OR')return states.includes(STATUS.YES)?STATUS.YES:states.includes(STATUS.UNKNOWN)?STATUS.UNKNOWN:STATUS.NO;
    return states.includes(STATUS.NO)?STATUS.NO:states.includes(STATUS.UNKNOWN)?STATUS.UNKNOWN:STATUS.YES;
  }
  function check(node,depth=0){
    if(!node||typeof node!=='object'||Array.isArray(node)||depth>20)return unknown({},'조건 형식 확인 필요');
    if(['RAW','MANUAL_REVIEW'].includes(node.operator))return unknown(node,node.reason||'자동 판정 불가 · 추가 확인 필요');
    const group=['AND','OR'].includes(node.operator)?node.operator:Array.isArray(node.any)?'OR':Array.isArray(node.all)?'AND':null;
    if(group){const nodes=node.conditions??(group==='OR'?node.any:node.all);if(!Array.isArray(nodes))return unknown(node,'조건 형식 확인 필요');const children=nodes.map(n=>check(n,depth+1));return{...node,status:combine(children,group),children};}
    if(node.subject&&node.subject!=='applicant')return unknown(node,'프로필 입력 항목·판정기 코드 추가 필요');
    if(node.anchor&&!['application_date','current_date'].includes(node.anchor))return unknown(node,'기준일 입력 항목·판정기 코드 추가 필요');
    const field=node.field==='region'?'region_code':node.field;
    if(!Object.hasOwn(values,field))return unknown(node,'프로필 입력 항목·판정기 코드 추가 필요');
    const actual=values[field],expected=node.value,op=node.op||({EQ:'eq',IN:'in',BETWEEN:'between',GTE:'gte',LTE:'lte',GT:'gt',LT:'lt'}[node.operator]);
    if(actual==null||actual===''||Array.isArray(actual)&&!actual.length)return unknown(node,'프로필 정보 미입력');
    let pass,valid=false;
    const scalar=x=>['string','number','boolean'].includes(typeof x)&&!(typeof x==='number'&&!Number.isFinite(x));
    if(['eq','neq'].includes(op)&&scalar(actual)&&scalar(expected)&&typeof actual===typeof expected){valid=true;pass=op==='eq'?actual===expected:actual!==expected;}
    if(op==='in'&&scalar(actual)&&Array.isArray(expected)&&expected.length&&expected.every(x=>scalar(x)&&typeof x===typeof actual)){valid=true;pass=expected.includes(actual);}
    if(op==='contains'&&Array.isArray(actual)&&scalar(expected)){valid=true;pass=actual.includes(expected);}
    if(op==='starts_with'&&typeof actual==='string'&&typeof expected==='string'&&expected.length){valid=true;pass=actual.startsWith(expected);}
    if(op==='between'&&typeof actual==='number'&&Number.isFinite(actual)&&Array.isArray(expected)&&expected.length===2&&expected.some(x=>x!=null)&&expected.every(x=>x==null||typeof x==='number'&&Number.isFinite(x))&&(expected[0]==null||expected[1]==null||expected[0]<=expected[1])){valid=true;pass=(expected[0]==null||actual>=expected[0])&&(expected[1]==null||actual<=expected[1]);}
    if(['gte','lte','gt','lt'].includes(op)&&typeof actual==='number'&&typeof expected==='number'&&Number.isFinite(actual)&&Number.isFinite(expected)){valid=true;pass=op==='gte'?actual>=expected:op==='lte'?actual<=expected:op==='gt'?actual>expected:actual<expected;}
    return valid?{...node,status:pass?STATUS.YES:STATUS.NO}:unknown(node,'판정기 코드 추가 필요 또는 조건 형식 확인 필요');
  }
  const required=Object.hasOwn(rules,'required')?rules.required:rules.all;
  const exclusions=Object.hasOwn(rules,'exclusions')?rules.exclusions:rules.exclude;
  const conditions=Array.isArray(required)?required.map(n=>check(n)):[];
  if(!conditions.length)conditions.push(unknown({text:'전체 필수 조건 확인 필요'},'전체 필수 조건 확인 필요'));
  if(required!=null&&!Array.isArray(required))conditions.push(unknown({},'required 형식 확인 필요'));
  if(exclusions!=null&&!Array.isArray(exclusions))conditions.push(unknown({},'exclusions 형식 확인 필요'));
  for(const node of Array.isArray(exclusions)?exclusions:[]){const evaluated=check(node);conditions.push({...evaluated,exclusion:true,status:evaluated.status===STATUS.YES?STATUS.NO:evaluated.status===STATUS.NO?STATUS.YES:STATUS.UNKNOWN});}
  const state=combine(conditions,'AND'),verified=policy.eligibility_verified===true&&rules.logic!=='UNVERIFIED';
  return{result:!verified?'CHECK':state===STATUS.NO?'INELIGIBLE':state===STATUS.UNKNOWN?'CHECK':'ELIGIBLE',conditions};
}
