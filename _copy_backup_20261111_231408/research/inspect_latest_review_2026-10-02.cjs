const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02','candidate_verification');
const targets=JSON.parse(fs.readFileSync(path.join(dir,'latest_review_targets_291.json'),'utf8').replace(/^\uFEFF/,''));
const logs=['checks.json','search_checks.json','latest_checks.json','latest_short_checks.json','remaining_checks.json'].flatMap(f=>fs.existsSync(path.join(dir,f))?JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')):[]);
const start=Number(process.argv[2]||0),end=start+Number(process.argv[3]||40);
const interpreted=JSON.parse(fs.readFileSync(path.join(dir,'remaining_review_decisions.json'),'utf8'));
for(const [i,t] of targets.entries()){if(i<start||i>=end||process.argv.includes('--unreviewed')&&interpreted[t.plcyNo])continue;console.log('\n'+i+' '+t.plcyNo+' '+t.시행기관+' '+t.정책명);
 const docs=[...new Map(logs.filter(c=>c.plcyNo===t.plcyNo).flatMap(c=>[...(c.자료||[]),...(c.첨부||[])]).map(r=>[r.URL,r])).values()];
 const compact=process.argv.includes('--compact');
 const norm=s=>String(s||'').replace(/202\d년?|청년|지원|사업|모집|공고|[^가-힣0-9a-z]/g,'');
 const stem=norm(t.정책명),pair=new Set(Array.from({length:Math.max(stem.length-1,0)},(_,i)=>stem.slice(i,i+2)));
 const score=r=>[...pair].filter(s=>norm(r.검색제목||r.title||r.첨부제목).includes(s)).length/Math.max(pair.size,1);
 const selected=compact?[...docs].sort((a,b)=>score(b)-score(a)).slice(0,2):docs;
 for(const r of selected){console.log('SOURCE '+r.URL+' '+String(r.검색제목||r.첨부제목||r.title||'').replace(/\s+/g,' ').slice(0,180)+' '+(r.status||r.error));
 let f=[r.file+'.document.txt',r.file+'.txt',r.textFile].filter(Boolean).find(f=>fs.existsSync(path.join(dir,f)));if(!f)continue;
 const text=fs.readFileSync(path.join(dir,f),'utf8'),lines=text.split('\n');console.log('FILE '+f);console.log(lines.filter(l=>/(2026|2025|접수기간|신청기간|모집기간|지원대상|전입)/.test(l)).filter(l=>l.length<700).slice(compact?-6:-15).join('\n'));}
}
