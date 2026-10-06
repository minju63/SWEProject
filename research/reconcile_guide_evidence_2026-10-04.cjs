const fs=require('fs'),path=require('path');
const helper=path.join(__dirname,'review_guide_notices_2026-10-03.cjs');
let s=fs.readFileSync(helper,'utf8');
const lines=[];
const args=['20260922005400113549','밀양 2026-1794호(7월16일) 재공고 HWPX 본문과 기존 검증 기록 재대조. 가족형 10호, 보증금600만원·월25만원. 만40세 미만 부부/유자녀 가족(영농 필수) 또는 2~3명 청년팀 경로. 밀양 관내 무주택은 필수, 전체 무주택·소득은 경쟁 우선순위로 구분. 부산 등 관외 신청과 입주 후 전입 경로를 일괄 제외하지 않음.','2026-07-22 ~ 2026-07-29 18:00','마감(밀양 재공고 회차)','개별 단지 모집공고·첨부 대조;전국 전체 미확정','기존 HOU-057의 밀양 개별 단지 근거를 재사용. 전국 청년농촌보금자리 모든 단지나 이후 재공고 검증 완료를 의미하지 않음. 나이 문구와 출생일 범위 차이는 기관 확인 대상.',['../MIRYANG_RURAL_NOTICE.txt','../MIRYANG_RURAL_FULL.txt'],'https://miryang.go.kr/dpt/eMiryangMinwonView.do?mnNo=2020000&owd=agricul&nmmIdx=60302'];
lines.push('note('+args.map(x=>JSON.stringify(x)).join(',')+');');
lines.push('assess('+['20260911005400113460','검색자료 불채택;행복주택과 통합공공임대 구분','부산문현2 1블록 2026-09-22 공고 PDF를 다시 확인. 이번 공급은 행복주택 144세대로 명시되어 있어 통합공공임대 사업의 개별 모집공고로 대체할 수 없음.','행복주택과 통합공공임대는 다른 공급유형. 같은 LH·같은 단지명 또는 안내의 장기임대 명부 문구만으로 동일사업으로 병합하지 않음. 통합공공임대 해당 모집공고는 미확정.',['../LH_MUNHYEON_PDF.pdf.txt'],['https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=10&ccrCnntSysDsCd=03&mi=1026&panId=2015122300020806&uppAisTpCd=06']].map(x=>JSON.stringify(x)).join(',')+');');
// 실제 ID를 목록에서 확인한 다음 기록한다.
const targets=JSON.parse(fs.readFileSync(path.join(__dirname,'raw_2026-10-02/candidate_verification/guide_notice_targets_2026-10-03.json'),'utf8'));
const integrated=targets.find(t=>t.plcyNo.endsWith('13460'));
if(!integrated)throw Error('통합공공임대 후보 누락');
lines[1]=lines[1].replace('20260911005400113460',integrated.plcyNo);
lines.push("for(const id of "+JSON.stringify(['20250903005400111595','20260406005400212457','20260407005400212550','20250714005400111217','20250715005400211288','20260922005400113549',integrated.plcyNo])+ "){assessments[id].대조일='2026-10-04';if(notes[id]&&assessments[id].분류!=='검색자료 불채택;행복주택과 통합공공임대 구분')notes[id].본문대조일='2026-10-04';}");
if(!s.includes('// Reconciled originals 2026-10-04'))s=s.replace('const central=notes[','// Reconciled originals 2026-10-04\n'+lines.join('\n')+'\nconst central=notes[');
fs.writeFileSync(helper,s);
const apply=path.join(__dirname,'apply_latest_review_2026-10-02.cjs');
fs.writeFileSync(apply,fs.readFileSync(apply,'utf8').replace('if(match)a.확인공고URL=match.URL','if(match&&!n.공식URL)a.확인공고URL=match.URL'));
const prep=path.join(__dirname,'prepare_housing_2026-10-02.cjs');
fs.writeFileSync(prep,fs.readFileSync(prep,'utf8').replace("update('HOU-001',{원문URL:","update('HOU-001',{게시일:'2026-03-18',원문URL:"));
