const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'raw_2026-10-02/candidate_verification');
const file=path.join(dir,'manual_targets.json'),targets=JSON.parse(fs.readFileSync(file,'utf8'));
for(const t of [
 {id:'20251117005400211898',URL:'https://www.hadong.go.kr/board/download.do?gcode=1001&name=2026%EB%85%84%ED%95%98%EB%8F%99%ED%98%95%EC%B2%AD%EB%85%84%EC%A3%BC%EA%B1%B0%EB%B9%84%EC%A7%80%EC%9B%90%EC%82%AC%EC%97%85%EA%B3%B5%EA%B3%A0%EB%AC%B82.pdf'},
 {id:'20260331005400212362',URL:'https://www.goryeong.go.kr/doc/document.html?fn=6271b5626a6e4fe08ee9cb220f8935f9.pdf&rs=2026101'},
 {id:'20260318005400212189',URL:'https://gwangyang.go.kr/boardDownload.es?bid=0001&list_no=208933&seq=1'},
 {id:'20260928005400213593',URL:'https://apply.bmc.busan.kr/smw/smw113020/selectPbancRentHouseList.do'},
 {id:'20260410005400212667',URL:'https://www.ubpi.or.kr/sub/?mcode=0403010000&no=3552'},
 {id:'20260410005400212667',URL:'https://www.ubpi.or.kr/_Inc/download.php?gb=supportdata&f_idx=56561'},
 {id:'20251117005400211898',URL:'https://www.hadong.go.kr/media/00008/00009.web?amode=view&idx=37812641&gcode=1001'},
 {id:'20260331005400212362',URL:'https://www.goryeong.go.kr/front/viewFile.do?IDX_FI=194226&BRD_ID=1023'}
])if(!targets.some(x=>x.id===t.id&&x.URL===t.URL))targets.push(t);
fs.writeFileSync(file,JSON.stringify(targets,null,2));
