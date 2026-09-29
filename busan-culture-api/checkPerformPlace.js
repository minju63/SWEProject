const fs = require("fs");

const data = JSON.parse(
    fs.readFileSync(
        "./data/list/performPlace.json",
        "utf8"
    )
);

let nullLat = 0;
let nullLng = 0;
let sameLatLng = 0;
let invalidLat = 0;
let invalidLng = 0;
let emptyAddr = 0;
let emptySigungu = 0;

for (const item of data) {

    const lat = Number(item.lttd);
    const lng = Number(item.lngt);

    // 위도 없음
    if (
        item.lttd === null ||
        item.lttd === undefined ||
        item.lttd === ""
    ) {
        nullLat++;
    }

    // 경도 없음
    if (
        item.lngt === null ||
        item.lngt === undefined ||
        item.lngt === ""
    ) {
        nullLng++;
    }

    // 숫자로 변환했을 때 이상
    if (
        !Number.isNaN(lat) &&
        (lat < 34.8 || lat > 35.5)
    ) {
        invalidLat++;
    }

    if (
        !Number.isNaN(lng) &&
        (lng < 128.7 || lng > 129.3)
    ) {
        invalidLng++;
    }

    // 위도와 경도가 완전히 같음
    if (
        !Number.isNaN(lat) &&
        !Number.isNaN(lng) &&
        lat === lng
    ) {
        sameLatLng++;
    }

    // 주소 없음
    if (
        !item.addr ||
        item.addr.trim() === ""
    ) {
        emptyAddr++;
    }

    // 시군구 없음
    if (
        !item.sigungu ||
        item.sigungu.trim() === ""
    ) {
        emptySigungu++;
    }
}

console.log("================================");
console.log("공연장 데이터 품질 검사");
console.log("================================");

console.log(`전체 : ${data.length}`);

console.log(`위도 null/빈값 : ${nullLat}`);
console.log(`경도 null/빈값 : ${nullLng}`);
console.log(`위도 범위 이상 : ${invalidLat}`);
console.log(`경도 범위 이상 : ${invalidLng}`);
console.log(`위도=경도 : ${sameLatLng}`);
console.log(`주소 없음 : ${emptyAddr}`);
console.log(`시군구 없음 : ${emptySigungu}`);