const fs=require('node:fs'),path=require('node:path');
module.exports=function({audit,followups,raw}){
 const dir=path.join(raw,'candidate_verification'),read=f=>fs.existsSync(path.join(dir,f))?JSON.parse(fs.readFileSync(path.join(dir,f),'utf8').replace(/^\uFEFF/,'')):[];
 const targets=read('latest_review_targets_291.json'),ids=new Set(targets.map(x=>x.plcyNo));
 const rechecks=read('recheck_2026-10-03.json');
 const logs=[...read('latest_checks.json'),...read('latest_short_checks.json'),...read('remaining_checks.json'),...rechecks],manual=read('manual_checks.json');
 const sourceRegistry=[...logs,...read('checks.json'),...read('search_checks.json')].flatMap(c=>[...(c.자료||[]),...(c.첨부||[])]).concat(manual);
 const notes={
 '20250304005400210584':{파일:'20250304005400210584_latest_attach_fccd59d490.html.document.txt',결과:'남도장학회2025-2호(2025-12-31) 2026 신규입사 선발 HWP 대조. 보호자의 광주·전남 주민등록이 기준이며 학생 본인의 부산주소만으로 탈락 확정 불가. 서울·인천·경기 대학/석사 입학예정·재학,휴학생 중2026학년도1학기 등록예정 예외 확인.',기간:'2026-01-02 09:00 ~ 2026-01-16 18:00',상태:'마감(신규입사 회차)',수준:'2026 신규입사 첨부 대조;후속결원 미확정',사유:'학숙 운영사업 전체가 종료된 뜻 아님. 이후 결원·수시선발 별도확인 필요'},
 '20251124005400211940':{파일:'20251124005400211940_latest_attach_0c47c9d457.html.document.txt',결과:'광양시2026-677호(2026-03-16) 청년취업자 주거비 모집 첨부 대조. 도 전체사업 중 광양53명 회차로,주소광양·18~45세·전남소재근로/사업·무주택·중위소득150%이하,최대월20만원12개월. 추가모집 가능 문구를 실제 추가접수로 해석하지 않음.',기간:'광양시 회차2026-03-16 ~ 2026-03-27;다른 시군 확인필요',상태:'광양시 회차마감;도 전체확인필요',수준:'일부 시군 개별공고·첨부 대조;전체 지역 미확정',사유:'도단위 API후보에 광양모집기간을 일괄 적용하지 않음. 다른시군·추가모집 미확정'},
 '20260513005400213198':{파일:'20260513005400213198_latest_attach_90769dea4a.pdf.txt',결과:'부산시2026-2373호(2026-08-03) 중개보수·이사비 모집공고 PDF 및 현재 부산청년플랫폼 대조. 접수8월18~24일,2025-08-01~2026-07-31 전입·부산내이사,18~39세 일하는 청년.9월23일은 결과통보일이며 모집마감일 아님.',기간:'2026-08-18 10:00 ~ 2026-08-24 18:00',상태:'마감',수준:'검색범위 내 2026 개별공고·첨부 대조',사유:'현재 플랫폼과 확보공고 일치. 미색인 후속/추가공고 부재는 보장하지 않음'},
 '20260513005400213199':{파일:'20260513005400213199_latest_5118fefa4a.txt',결과:'현재 부산청년플랫폼2026 청년월세 본문 대조. 접수3월30일~5월29일과 수혜자 지급기간2028년12월까지를 구분. 지급중지 후2029년 이후 재신청 안내가 지금 모집을 뜻하지 않음.',기간:'2026-03-30 09:00 ~ 2026-05-29 16:00',상태:'마감',수준:'2026 공식 모집안내 본문 대조;정정 첨부 미확정',사유:'2026 접수안내는 확인. 개별 정정/추가공고·첨부 전체 대조 미확정'},
 '20260513005400213187':{파일:'20260513005400213187_latest_b899c1e4fd.txt',결과:'부산시 전세보증금반환보증 보증료지원 현행안내(최종수정2026-07-23) 대조. 접수2026-01-01부터 예산소진 시까지이며2025 확대 보도자료를2026 모집공고로 바꾸지 않음.',기간:'2026-01-01 ~ 예산소진 시(날짜미확정)',상태:'확인필요(예산·접수 여부)',수준:'현행 2026 공식안내 대조;예산 마감 미확정',사유:'수정일은 공고 게시일과 구분. 예산소진 여부를 공개본문에서 확정하지 못함'},
 '20260430005400212956':{파일:'20260430005400212956_latest_e31b274f4f.txt',결과:'부산시2026 하반기 전세사기피해주택 시설개선 모집본문(2026-07-02) 대조. 부산 소재 피해주택의 공용부 안전·복구 지원이며 일반청년 개인 월세지원과 구분.',기간:'2026-07-15 ~ 2026-08-14',상태:'마감',수준:'2026 하반기 공식 모집본문 대조;첨부 추가확인 필요',사유:'현재 확보 하반기회차 마감. 구청 시행과 대상주택 부산 범위를 구분. 후속정정·추가 첨부 미확정'},
 '20260928005400213618':{파일:'20260928005400213618_manual_40ac496788.txt',결과:'2026-10-01 고성형 청년 월세 신규 모집 본문 대조. 중앙정부 청년월세와 별개: 고성군 부모와 별도 거주 18~45세 무주택 세대주·중위소득120% 이하, 10명, 월20만원 최대1년.',기간:'2026-10-01 ~ 2026-10-16',상태:'모집중',수준:'2026 개별공고 본문 대조;첨부 미확보',사유:'직원안내 공지에서 공고 본문은 확보했으나 본문이 언급하는 붙임 링크가 공개 HTML에 없어 첨부의 예외·제외조건 및 추가 정정은 미확정'},
 '20250502005400210779':{파일:'20250502005400210779_latest_attach_3f0bc87b34.zip.document.txt',결과:'부산시2026-2850호(2026-09-28) 머물자리론 3차변경 공고 첨부 대조. 연소득2600만원 이하 시지원금리3%·본인0.5% 신설(2026-11-01 이후 대출실행분 적용). 신혼부부지원 종료자, 기존 기금대출 상환·대환, 공공주택 만료이사 예외를 일괄 제외하지 않음.',기간:'2026-10-01 09:00 ~ 2026-10-10 18:00;매월1~10일,1~11월,예산조기마감가능',상태:'모집중',수준:'검색범위 내 2026 변경공고·첨부 대조',사유:'9월28일 3차변경 첨부 기준. 예산 소진에 의한 접수종료 및 미색인 후속공고까지 부재 보장 불가'},
 '20260513005400213200':{파일:'20260513005400213200_latest_attach_3f0bc87b34.zip.document.txt',결과:'머물자리론2026-2850호 3차변경 HWPX 대조: 저소득 구간 금리지원 신설(2026-11-01 이후 대출실행분), 월별 접수. 2025 후보와 동일현행사업에 연결하되 API행을 삭제하지 않음.',기간:'2026-10-01 09:00 ~ 2026-10-10 18:00;매월1~10일,1~11월,예산조기마감가능',상태:'모집중',수준:'검색범위 내 2026 변경공고·첨부 대조',사유:'예산소진·미색인 후속공고 미확정'},
 '20260429005400212903':{파일:'20260429005400212903_manual_049d1fddf8.txt',추가파일:['../lucky_full.txt'],결과:'부산시2026-1982호(2026-06-16) 럭키7하우스 정정 본문: 원공고2026-1150호(4월6일)의 신혼부부 혼인 시작 기준일2019-03-27을2019-03-26으로 변경. 2022년 보도자료를2026 후속공고로 취급하지 않음.',기간:'2026-06-29 ~ 2026-07-15;연결 정책 행 공고 기준',상태:'마감',수준:'2026 정정본문·기존첨부 대조;후속 미확정',사유:'정정문 본문과 연결행 기존 정정HWPX 추출문을 대조. 이후 추가 모집의 전체 목록 대조는 미확정'},
 '20260928005400213594':{파일:'20260928005400213594_manual_25f7fb50d2.pdf.txt',추가파일:['20260928005400213594_manual_585b9ca037.pdf.txt'],결과:'BMC2026-153호 행복주택 원공고(7월20일)와2026-173호 정정(7월22일),52쪽 공고 첨부 대조. 시청앞2단지26OA/26OB/26ABCD 가스·전기쿡탑 X→○;그 외 변경없음. LH 부산문현2 9월공고와 기관·단지·회차가 다름.',기간:'BMC 행복주택7월회차 마감;LH부산문현2는2026-10-06 ~ 2026-10-08;통합공공임대 확인필요',상태:'유형·기관별 상이',수준:'일부 유형 원·정정·첨부 대조;전체 유형 미확정',사유:'후보명이 행복주택+통합공공임대 통합사업이므로 BMC 행복주택1건을 전체 최신공고로 일반화하지 않음'},
 '20260406005400212460':{파일:'20260406005400212460_latest_attach_3f22d48606.html.document.txt',결과:'인천시2025-2943호(2025-12-24) 천원복비 첨부 대조. 2026-01-01 이후 계약 대상이며 계약일로부터1년 내 신청·예산소진 시 종료. 인천 거주 또는 전입자 허용,2년 미만 계약 제외,부가세제외30만원 상한에서1000원 공제.',기간:'2026-01-01 이후 임대차계약;계약일로부터1년 이내·예산소진 시 마감(고정모집기간 아님)',상태:'확인필요(예산·접수가능 여부)',수준:'2026 계약대상 공식공고·첨부 대조;접수 미확정',사유:'공고 게시연도2025라도 대상계약연도2026임. 예산잔여·기관 접수마감 여부는 확인되지 않아 상시/모집중으로 추정하지 않음'},
 '20250710005400211162':{파일:'20250710005400211162_latest_attach_6d2a05618e.zip.document.txt',결과:'군산시2026-1545호(2026-06-15) 신혼부부 주거자금 대출이자지원 첨부 대조. 부부 모두 군산 주민등록·동일주소,혼인7년이내,중위소득180%이하. 신청7월1~20일과 지원이자 대상1~11월을 구분.',기간:'2026-07-01 ~ 2026-07-20(토·일·공휴일 제외)',상태:'마감',수준:'2026 개별공고·첨부 대조;후속공고 미확정',사유:'확보한2026 회차는 마감. 이후 추가모집이 없다는 기관 전체게시판 대조는 미확정'},
 '20250716005400211305':{파일:'20250716005400211305_latest_attach_8e9b012006.html.document.txt',결과:'장수군2026-181호(2026-02-11) 청년·신혼부부 주거비 수시모집 HWP 대조. 관내주소·실거주·중위소득150%이하·소득/구직급여 요건. 청년19~39세미혼/신혼혼인5년이내부부모두49세이하를 별도 경로로 유지.',기간:'2026-02-11 ~ 2026-12-15(평일18:00;토·일·공휴일 제외)',상태:'모집중(확보공고 기준)',수준:'2026 개별공고·첨부 대조;후속공고 미확정',사유:'공고에 변경 시 재공고 명시. 사업기간2~12월을 접수기간으로 대신하지 않음. 후속정정·조기종료 미확정'},
 '20260422005400212848':{파일:'20260422005400212848_latest_attach_f469fb0a9c.html.document.txt',결과:'제주3만원주택2차(2026-05-08 발표) 첨부 본문 대조: 접수5월13일~6월12일,신혼7년이내,월평균소득130%(맞벌이200%) 등. 3차모집 보도 단서는 있으나 이번 확보한 공식문서는2차이므로 최신확정 불가.',기간:'확보2차:2026-05-13 ~ 2026-06-12;후속3차 공식공고 확인필요',상태:'확인필요(후속 회차)',수준:'과거 회차 첨부 대조;후속 공식공고 미확정',사유:'2차 공고로 현재 모집여부를 판정하지 않음. 3차의 공식 시행기관 공고와 접수조건 확보 필요'}
 };
 Object.assign(notes,read('remaining_review_decisions.json'));
 const pendingAssessments=read('pending_123_source_assessments.json');
 const guideAssessments=fs.existsSync(path.join(dir,'guide_notice_assessments_2026-10-03.json'))?read('guide_notice_assessments_2026-10-03.json'):{};
 const comparisons=new Map(read('remaining_evidence_comparison_276.json').map(r=>[r.plcyNo,r]));
 for(const a of audit){if(!ids.has(a.plcyNo))continue;
  const records=logs.filter(r=>r.plcyNo===a.plcyNo),sources=[...records.flatMap(r=>[...(r.자료||[]),...(r.첨부||[])]),...manual.filter(r=>r.plcyNo===a.plcyNo)];
  const sf=['search_latest_','search_latest_short_','search_remaining_'].map(p=>p+a.plcyNo+'.json').filter(f=>fs.existsSync(path.join(dir,f)));
  a.재조사대상='최신성 미확정291건 원래 대상';
  const ga=guideAssessments[a.plcyNo];
  if(ga){a.안내계획공고대조일=ga.대조일;a.안내계획공고대조분류=ga.분류;a.안내계획공고대조결과=ga.결과;a.안내계획공고대조한계=ga.한계;a.안내계획공고검색어=ga.검색어;a.안내계획공고출처=ga.공식URL.join(';');a.안내계획공고증빙=[ga.검색증빙,...ga.본문파일].map(f=>'raw_2026-10-02/candidate_verification/'+f).join(';');}
  const pa=pendingAssessments[a.plcyNo];
  if(pa){a.미대조후보점검일=pa.점검일;a.미대조후보점검분류=pa.점검분류;a.미대조후보점검결과=pa.결과;a.미대조후보점검한계=pa.검증한계;
   if(pa.추가73검색일){a.추가73검색일=pa.추가73검색일;a.추가73검색어=pa.추가73검색어;a.추가73검색증빙=pa.추가73검색증빙;}
  }
  const fresh=rechecks.find(r=>r.plcyNo===a.plcyNo);
  if(fresh){
   a.공식자료재조회일=fresh.확인일;a.공식자료재조회한계=fresh.선택기준;a.공식자료재조회건수=(fresh.자료||[]).length;a.공식첨부재조회건수=(fresh.첨부||[]).length;
   const checked=[...(fresh.자료||[]),...(fresh.첨부||[])];
   a.공식자료재조회상세=checked.map(s=>{
    const file=[s.file&&s.file+'.document.txt',s.file&&s.file+'.txt',s.textFile].filter(Boolean).find(f=>fs.existsSync(path.join(dir,f)));
    const size=file?fs.readFileSync(path.join(dir,file),'utf8').trim().length:0;
    return `${s.URL} | ${s.status||s.error||'응답 미확정'} | ${s.errorPage?'오류 안내 본문':!size?'해석할 본문 미확보':size<30?'제목·이동 안내만 확보':'텍스트 확보;동일사업·최신성 별도 대조'} | ${file||'미확보'}`;
   }).join('\n')||'선정기준에 맞는 직접 공식 연결 자료 없음;사업 부존재 판정 아님';
  }
  a.기관지정추가검색=sf.map(f=>read(f).query||'검색오류').join(' | ');
  a.추가공고조회기록=sources.length?sources.map(r=>`${r.status||r.error||'응답미확정'} ${r.URL}`).join(';'):'기관 지정 검색에서 제목 유사 공식 후보 미확보;사업 부존재 판정 아님';
  const good=sources.filter(r=>r.status===200&&!r.errorPage),bad=sources.filter(r=>r.error||r.status!==200||r.errorPage);
  a.재조회미확정사유=sources.length?(good.length?'응답성공 원문후보 '+good.length+'개;동일 사업·기관·회차와 원/정정/추가 첨부의 수동대조가 필요한 상태. ':'응답성공 원문후보 없음. ')+bad.map(r=>`${r.URL}: ${r.status||r.error||'응답미확정'}${r.errorPage?' 오류페이지 본문':''}`).join(';'):'기관 지정2026 검색2종에서 선정기준(공식/API참고도메인·제목유사도0.55)에 맞는 원문후보 미확보. 검색에 미색인·다른 하위도메인·사업명 변경 가능성이 있어 공고없음/신청불가 확정 불가';
  const files=[...sf,...sources.flatMap(r=>[r.file,r.textFile,r.file&&fs.existsSync(path.join(dir,r.file+'.document.txt'))?r.file+'.document.txt':null,r.file&&fs.existsSync(path.join(dir,r.file+'.txt'))?r.file+'.txt':null]).filter(Boolean)];
  a.전수검증증빙=[...new Set([...a.전수검증증빙.split(';'),...files.map(f=>'raw_2026-10-02/candidate_verification/'+f)])].join(';');
  a.추가첨부본문확보=sources.filter(r=>r.file&&(/\.pdf$/.test(r.file)?fs.existsSync(path.join(dir,r.file+'.txt')):fs.existsSync(path.join(dir,r.file+'.document.txt')))).map(r=>r.URL).join(';')||'이번 추가조회에서 해석 가능한 첨부 본문 미확보';
  a.재조사대조단계='기관지정검색·원문후보 조회;동일사업·정정·첨부 수동대조 미완료';
  const comparison=comparisons.get(a.plcyNo);
  if(comparison){
   a.추가원문대조일=comparison.대조일;
   a.추가출처대조=comparison.원문대조자료.map(s=>`${s.URL} | ${s.본문확보} | ${s.본문파일}`).join('\n')||'공식 원문 후보 미확보;사업 부존재 판정 아님';
   a.추가접수문구대조=comparison.원문대조자료.filter(s=>s.접수문구.length).map(s=>`${s.URL} | ${s.접수문구.join(' / ')}`).join('\n')||'접수기간 문구 미검출;상시 판정 근거 아님';
   a.추가기계검출주의=comparison.원문대조자료.map(s=>`${s.URL} | ${s.기계검출주의.join(' / ')}`).join('\n');
   a.추가본문해석여부=notes[a.plcyNo]?'개별 본문 해석 기록 있음;최신성 검증수준 참조':'개별 본문 해석 미완료;검색·기계대조를 최신 확인으로 사용하지 않음';
  }
  const n=notes[a.plcyNo];if(n){for(const f of[n.파일,...(n.추가파일||[])])if(!fs.existsSync(path.join(dir,f)))throw Error('Missing reviewed attachment '+f);
   a.개별본문대조일=n.본문대조일||'2026-10-02';
   a.모집공고대조결과=n.결과;a.확인접수기간=n.기간;a.확인회차진행상태=n.상태;a.최신성검증=n.수준;a.최신성미확정사유=n.사유;a.재조사대조단계='확보 자료 개별 해석;공고 여부·동일사업·최신성은 검증수준 참조';
   a.재조회미확정사유=n.사유;
   if(n.공식URL)a.확인공고URL=n.공식URL;
   if(n.판정){a.판정=n.판정;a.사유+=';'+n.결과;}
   const match=sourceRegistry.find(r=>r.textFile===n.파일||r.file+'.txt'===n.파일||r.file+'.document.txt'===n.파일);if(match&&!n.공식URL)a.확인공고URL=match.URL;
   a.전수검증증빙+=';'+[n.파일,...(n.추가파일||[])].map(f=>'raw_2026-10-02/candidate_verification/'+f).join(';');
  }
  const f=followups.find(x=>x.plcyNo===a.plcyNo);if(f)for(const k of['모집공고대조결과','확인접수기간','확인회차진행상태','최신성검증','최신성미확정사유','검색검증기록','재조사대조단계','추가첨부본문확보','공식자료재조회일','공식자료재조회한계','공식자료재조회건수','공식첨부재조회건수','공식자료재조회상세','개별본문대조일','확인공고URL'])f[k]=a[k];
  if(f&&pa)for(const k of['미대조후보점검일','미대조후보점검분류','미대조후보점검결과','미대조후보점검한계','추가73검색일','추가73검색어','추가73검색증빙'])if(a[k]!==undefined)f[k]=a[k];
  if(f&&ga)for(const k of['안내계획공고대조일','안내계획공고대조분류','안내계획공고대조결과','안내계획공고대조한계','안내계획공고검색어','안내계획공고출처','안내계획공고증빙'])f[k]=a[k];
 }
 return {대상:ids.size,기관지정검색:targets.filter(t=>fs.existsSync(path.join(dir,'search_latest_'+t.plcyNo+'.json'))).length,추가짧은검색:targets.filter(t=>fs.existsSync(path.join(dir,'search_latest_short_'+t.plcyNo+'.json'))).length,원문후보조회: new Set(logs.map(r=>r.plcyNo)).size,이번수동본문대조:Object.keys(notes).length,이번수동본문미대조:ids.size-Object.keys(notes).length,미대조123추가점검:{대상:Object.keys(pendingAssessments).length,분류:Object.values(pendingAssessments).reduce((a,p)=>(a[p.점검분류]=(a[p.점검분류]||0)+1,a),{})},주의:'후보 조회·첨부 추출은 동일사업 및 최신성 검증 완료가 아님'};
};
