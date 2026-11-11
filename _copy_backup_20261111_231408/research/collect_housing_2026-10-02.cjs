const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir=__dirname,raw=path.join(dir,'raw_2026-10-02');fs.mkdirSync(raw,{recursive:true});
const previous=JSON.parse(cp.execFileSync('git',['show','09a943a:research/housing_2026-09-29.json'],{encoding:'utf8',maxBuffer:5000000}));
const meta=JSON.parse(cp.execFileSync('git',['show','09a943a:research/housing_sources_2026-09-29.json'],{encoding:'utf8',maxBuffer:5000000}));
fs.writeFileSync(path.join(raw,'previous_data.json'),JSON.stringify(previous,null,2));fs.writeFileSync(path.join(raw,'previous_sources.json'),JSON.stringify(meta,null,2));
const key=fs.readFileSync(path.join(dir,'../.env'),'utf8').match(/^YOUTHCENTER_API_KEY=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
const requests=meta.sources.filter(s=>!s.URL.includes('/go/ythip/')).map(s=>({id:s.source_id,url:s.URL,related:s.관련data_id}));
for(const [id,url,related] of [
 ['NEW_MOVING','https://www.busan.go.kr/nbnews/1746181','HOU-007'],
 ['NEW_HOUSING','https://www.myhome.go.kr/hws/portal/cont/selectHappyHouseView.do','후보'],
 ['NEW_CENTER','https://www.busan.go.kr/housing/ko/pages/residential_welfare.php','HOU-009'],
 ['NEW_ENERGY','https://www.energyv.or.kr/info/support_info.do','HOU-003'],
 ['NEW_ALLOWANCE','https://www.myhome.go.kr/hws/portal/cont/selectYouthPolicyHousingView.do','HOU-015'],
 ['NEW_BMC','https://www.bmc.busan.kr','후보'],
 ['NEW_BUSANJIN','https://www.busanjin.go.kr','부산진구 추가조사'],
])requests.push({id,url,related});
if(key)for(const [id,params]of [...Array.from({length:4},(_,i)=>['API_HOUSING_'+(i+1),{pageNum:String(i+1),lclsfNm:'주거'}]),['API_TRANSPORT',{plcyNm:'교통'}],['API_BUSANJIN',{zipCd:'26230'}],['API_SAHA',{zipCd:'26380'}]]){
 const u=new URL('https://www.youthcenter.go.kr/go/ythip/getPlcy');u.search=new URLSearchParams({apiKeyNm:key,pageNum:'1',pageSize:'100',rtnType:'json',...params});requests.push({id,url:u.href,related:'후보',api:true,params});
}
function plain(t){return t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\/(?:p|div|li|tr|h\d|dd|dt)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n)).replace(/&(nbsp|amp|lt|gt|quot|apos);/g,(_,n)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[n])).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();}
async function fetchOne(q){const record={id:q.id,URL:q.api?'https://www.youthcenter.go.kr/go/ythip/getPlcy':q.url,관련data_id:q.related,요청조건:q.params,확인일:'2026-10-02'};try{const r=await fetch(q.url,{signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());record.status=r.status;record.contentType=r.headers.get('content-type');record.bytes=b.length;record.sha256=crypto.createHash('sha256').update(b).digest('hex');const binary=b.subarray(0,4).toString().startsWith('%PDF')||b[0]===80&&b[1]===75;const filename=q.id+(binary?'.bin':q.api?'.json':'.html');record.file=filename;if(binary)fs.writeFileSync(path.join(raw,filename),b);else{let t=b.toString('utf8');if(key)t=t.split(key).join('[REDACTED]');fs.writeFileSync(path.join(raw,filename),t);if(!q.api)fs.writeFileSync(path.join(raw,q.id+'.txt'),plain(t));}console.log(q.id+' '+r.status+' '+b.length);}catch(e){record.error=e.name;console.log(q.id+' '+e.name);}return record;}
(async()=>{const logs=[];for(let i=0;i<requests.length;i+=4)logs.push(...await Promise.all(requests.slice(i,i+4).map(fetchOne)));fs.writeFileSync(path.join(raw,'fetch_log.json'),JSON.stringify(logs,null,2));console.log(JSON.stringify({requests:logs.length,ok:logs.filter(x=>x.status===200).length,apiConfigured:!!key}));})();
