const fs=require('node:fs'),path=require('node:path');
const norm=s=>String(s||'').replace(/202\d년?|모집|공고|지원사업|지원|사업|청년|[^가-힣a-zA-Z0-9]/g,'');
module.exports=function(dir,p,records){
 const findings=[];
 for(const r of records){
  let detail;
  if(r.error)detail='조회실패:'+r.error;
  else if(r.status!==200)detail='HTTP '+r.status;
  else if(r.errorPage)detail='응답200이나 오류 안내 본문';
  else if(!r.textFile)detail=/\.pdf$/.test(r.file||'')?'PDF 첨부:본문·동일사업 대조 별도 필요':'비HTML 첨부:본문 판독 별도 필요';
  else{
   const file=path.join(dir,r.textFile),body=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
   const title=r.검색제목||r.title||'',stem=norm(p.plcyNm),t=norm(title);
   const bytes=fs.existsSync(path.join(dir,r.file||''))&&r.file?fs.readFileSync(path.join(dir,r.file)).subarray(0,12):Buffer.alloc(0);
   const binary=bytes[0]===0xff&&bytes[1]===0xd8||bytes[0]===0x89&&bytes[1]===0x50||bytes[0]===0xd0&&bytes[1]===0xcf;
   const dateLines=body.split(/\n/).filter(line=>/신청기간|접수기간|모집기간|공고기간|신청일정/.test(line)).slice(0,3).map(line=>line.trim().slice(0,180));
   if(binary)detail='이미지/HWP 바이너리:HTML 텍스트로 읽을 수 없음';
   else if(!body.trim())detail='본문 텍스트 없음:스크립트 렌더링·이미지·응답내용 추가 확인 필요';
   else if(/로그인/.test(body)&&body.trim().length<700)detail='로그인/짧은 안내 페이지:모집 본문 미확보';
   else if(stem.length>=4&&t.includes(stem))detail='정책명 핵심문구가 제목에 포함된 원문 후보;사업·회차·기관 최종대조 필요'+(dateLines.length?';기간 표제 발견:'+dateLines.join(' / '):';명시 접수기간 표제 미검출');
   else detail='조회한 페이지 제목만으로 동일사업 공고 미확정'+(title?':'+title.slice(0,160):';제목 없음')+(dateLines.length?';기간문구는 다른 사업/메뉴일 수 있어 자동 채택하지 않음':'');
  }
  findings.push(`${r.URL} => ${detail}`);
 }
 return findings.length?findings.join('\n'):'API 공식 URL 공란 또는 검색 후보 원문 미확보;사업이 없다는 근거가 아님';
};
