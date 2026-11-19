'use strict';
// A government news publisher is still not an application notice or program guide.
function isProgramUrl(value) {
  try {
    const u=new URL(value),host=u.hostname.toLowerCase();
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)return false;
    // Evidence attachments and AJAX body fragments are not user-facing guide pages.
    if(/\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)$/i.test(u.pathname)||/\/(?:FileDown|selectFileDown|download)\.do$/i.test(u.pathname))return false;
    if((host==='myhome.go.kr'||host.endsWith('.myhome.go.kr'))&&/^\/html\/content\//i.test(u.pathname))return false;
    if(['korea.kr','blog.naver.com','tistory.com','blog.daum.net'].some(d=>host===d||host.endsWith('.'+d)))return false;
    if(host.startsWith('news.'))return false;
    if(/\/(?:nbtnews[^/]*|nbnews|briefing|pressRelease|curation)(?:\/|$)|\/nw\/rpd\//i.test(u.pathname))return false;
    return true;
  } catch { return false; }
}
module.exports={isProgramUrl};
