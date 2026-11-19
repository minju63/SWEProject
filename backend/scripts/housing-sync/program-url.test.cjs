const {test}=require('node:test'),assert=require('node:assert/strict');
const {isProgramUrl}=require('./program-url.cjs'),{selectCandidate}=require('./auto.cjs');
test('housing links reject news and blogs while accepting actual agency notices and program guides',()=>{
 for(const u of ['https://www.korea.kr/news/policyNewsView.do?newsId=1','https://m.korea.kr/briefing/pressReleaseView.do?newsId=1','https://download.blog.naver.com/file.hwpx','https://blog.naver.com/busanjin9/1','https://news.saha.go.kr/portal/contents.do?mId=1','https://www.busan.go.kr/nbtnewsBU/1','https://www.mogef.go.kr/nw/rpd/nw_rpd_s001d.do?bbtSn=1'])assert.equal(isProgramUrl(u),false,u);
 for(const u of ['https://www.bokjiro.go.kr/ssis-tbu/cms/pc/customer/notice/1309500_1141.html','https://www.busan.go.kr/nbgosi/view?sno=1','https://www.foodvoucher.go.kr/','https://www.koref.or.kr/web/intropage/intropageShow.do?page_id=1','https://www.mogef.go.kr/sp/yth/sp_yth_f017.do'])assert.equal(isProgramUrl(u),true,u);
 const candidate={origin:'YOUTHCENTER_API',status:'NEW_CANDIDATE_REVIEW',relevant:true,scope:{hint:'KR'}};
 assert.equal(selectCandidate(candidate,{source_url:'https://www.korea.kr/news/policyNewsView.do?newsId=1'},'2026-11-18'),'news_or_blog_requires_program_source');
});
test('representative links reject attachment downloads and MyHome body fragments',()=>{
 for(const u of [
  'https://young.busan.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_000000000118909&fileSn=0',
  'https://www.myhome.go.kr/html/content/MyHomeGuideRH109.html',
  'https://www.myhome.go.kr/html/content/MyHomeGuideMENU003.html',
  'https://www.myhome.go.kr/html/content/MyHomeGuideMENU002.html',
  'https://agency.go.kr/notice.hwpx',
 ])assert.equal(isProgramUrl(u),false,u);
 for(const u of [
  'https://young.busan.go.kr/index.nm?menuCd=0',
  'https://www.myhome.go.kr/hws/portal/cont/selectYouthPolicyPublicSupPrivateView.do',
  'https://www.myhome.go.kr/hws/portal/cont/selectYouthPolicyProtectEndChildView.do',
  'https://www.myhome.go.kr/hws/portal/cont/selectYouthPolicyHousWeakSupView.do',
  'https://www.hf.go.kr/ko/sub01/sub01_02_01.do',
 ])assert.equal(isProgramUrl(u),true,u);
 const c={origin:'YOUTHCENTER_API',status:'NEW_CANDIDATE_REVIEW',relevant:true,scope:{hint:'KR'}};
 assert.ok(selectCandidate(c,{source_url:'https://www.myhome.go.kr/html/content/MyHomeGuideRH109.html'},'2026-11-18'));
});
