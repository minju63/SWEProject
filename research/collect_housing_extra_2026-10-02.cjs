const fs=require('node:fs'),path=require('node:path');const raw=path.join(__dirname,'raw_2026-10-02');
const requests=[
 ['LH_LIST','https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026&panNm=%EC%B2%AD%EB%85%84&viewType=srch'],
 ['DREAM','https://www.busan.go.kr/depart/dreamhouse'],
 ['LUCKY','https://www.busan.go.kr/depart/house0203'],
 ['HAPPY_BUSAN','https://www.busan.go.kr/depart/ahhouse'],
 ['BMC_LIST','https://apply.bmc.busan.kr/smw/smw114010/selectNoticeList.do'],
 ['SAHA_PLAN','https://m.saha.go.kr/portal/Downfiles/s_basicplan_2601.pdf'],
 ['CENTER_MOVING','https://www.busan.go.kr/housing/ko/pages/moving_expenses_support.php'],
 ['DREAM_LOAN','https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030901.jsp'],
 ['DREAM_ACCOUNT','https://nhuf.molit.go.kr/FP/FP07/FP0701/FP07010301.jsp'],
 ['RENT_LOAN','https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp'],
 ['SCHOLARSHIP','https://www.kosaf.go.kr/ko/notice.do?mode=view&seqNo=21163'],
 ['HF','https://www.hf.go.kr/ko/sub02/sub02_01_02.do'],
];
async function get([id,url]){const old=fs.existsSync(path.join(raw,'fetch_extra_log.json'))?JSON.parse(fs.readFileSync(path.join(raw,'fetch_extra_log.json'),'utf8')).find(x=>x.id===id):null;if(old)return old;const log={id,URL:url,확인일:'2026-10-02'};try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)}),b=Buffer.from(await r.arrayBuffer());log.status=r.status;const bin=b.subarray(0,4).toString()==='%PDF';log.file=id+(bin?'.bin':'.html');fs.writeFileSync(path.join(raw,log.file),b);console.log(id+' '+r.status+' '+b.length);}catch(e){log.error=e.name;console.log(id+' '+e.name);}return log;}
(async()=>{const logs=[];for(let i=0;i<requests.length;i+=4)logs.push(...await Promise.all(requests.slice(i,i+4).map(get)));fs.writeFileSync(path.join(raw,'fetch_extra_log.json'),JSON.stringify(logs,null,2));})();
