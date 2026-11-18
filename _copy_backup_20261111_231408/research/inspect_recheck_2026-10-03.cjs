const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02/candidate_verification'),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8').replace(/^\uFEFF/,''));
const targets=read('latest_review_targets_291.json'),logs=read('recheck_2026-10-03.json'),notes=read('remaining_review_decisions.json');
for(const[i,t]of targets.entries()){
 if(i<Number(process.argv[2]||0)||i>=Number(process.argv[2]||0)+Number(process.argv[3]||20)||process.argv.includes('--unreviewed')&&notes[t.plcyNo])continue;
 const r=logs.find(r=>r.plcyNo===t.plcyNo);console.log('\n'+i+' '+t.plcyNo+' '+t.정책명);
 for(const s of [...(r?.資料||r?.자료||[]),...(r?.첨부||[])]){
  const file=[s.file&&s.file+'.document.txt',s.file&&s.file+'.txt',s.textFile].filter(Boolean).find(f=>fs.existsSync(path.join(dir,f)));
  const body=file?fs.readFileSync(path.join(dir,file),'utf8'):'';
  console.log(JSON.stringify({URL:s.URL,title:String(s.title||s.첨부제목||'').replace(/\s+/g,' ').slice(0,180),status:s.status||s.error,file,chars:body.length}));
  const lines=body.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&l.length<450);
  const hits=[];for(let k=0;k<lines.length;k++)if(/신청기간|접수기간|모집기간|지원대상|신청자격|공고일은|공고 제|입주자 모집|신청기한|사업기간/.test(lines[k]))hits.push(lines.slice(k,k+4).join(' ').slice(0,450));
  console.log(hits.slice(0,7).join('\n'));
 }
}
