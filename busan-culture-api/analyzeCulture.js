const fs = require("fs");

// ==========================================
// 파일 읽기
// ==========================================

const places = JSON.parse(
    fs.readFileSync(
        "./data/list/performPlace.json",
        "utf8"
    )
);

const events = JSON.parse(
    fs.readFileSync(
        "./data/list/theme.json",
        "utf8"
    )
);


// ==========================================
// 오늘 날짜
// YYYY-MM-DD
// ==========================================

const today = new Date();

function formatDate(date) {

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

const todayStr = formatDate(today);


// ==========================================
// 공백 정리
// ==========================================

function normalize(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .trim()
        .replace(/\s+/g, " ");
}


// ==========================================
// 날짜 유효성 검사
// ==========================================

function isValidDate(value) {

    const str = normalize(value);

    if (!str) {
        return false;
    }

    // 0000-00-00 같은 값 제거
    if (str === "0000-00-00") {
        return false;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(str);
}


// ==========================================
// 장소 Map 만들기
// placeId → 장소 데이터
// ==========================================

const placeMap = new Map();

for (const place of places) {

    const id = normalize(
        place.placeId
    );

    if (!id) {
        continue;
    }

    placeMap.set(id, place);
}


// ==========================================
// 기본 통계
// ==========================================

let currentEvents = [];
let pastEvents = [];
let invalidDateEvents = [];

let districtEvents = [];

let noPlaceId = [];
let placeMatchFail = [];


// ==========================================
// 좌표 이상 통계
// ==========================================

let nullLat = [];
let nullLng = [];
let invalidLat = [];
let invalidLng = [];
let sameLatLng = [];
let emptyAddr = [];


// ==========================================
// 공연장 좌표 검사
// ==========================================

for (const place of places) {

    const lat = normalize(place.lttd);
    const lng = normalize(place.lngt);
    const addr = normalize(place.addr);

    // 위도 없음
    if (!lat) {
        nullLat.push(place);
    }

    // 경도 없음
    if (!lng) {
        nullLng.push(place);
    }

    // 주소 없음
    if (!addr) {
        emptyAddr.push(place);
    }


    const latNum = Number(lat);
    const lngNum = Number(lng);


    // 위도 범위 검사
    if (
        lat &&
        (
            Number.isNaN(latNum) ||
            latNum < 34.8 ||
            latNum > 35.5
        )
    ) {
        invalidLat.push(place);
    }


    // 경도 범위 검사
    if (
        lng &&
        (
            Number.isNaN(lngNum) ||
            lngNum < 128.7 ||
            lngNum > 129.3
        )
    ) {
        invalidLng.push(place);
    }


    // 위도 = 경도
    if (
        lat &&
        lng &&
        !Number.isNaN(latNum) &&
        !Number.isNaN(lngNum) &&
        latNum === lngNum
    ) {
        sameLatLng.push(place);
    }
}


// ==========================================
// 행사 검사
// ==========================================

for (const event of events) {

    const placeId =
        normalize(event.place_id);

    const startDate =
        normalize(event.op_st_dt);

    const endDate =
        normalize(event.op_ed_dt);


    // --------------------------------------
    // place_id 없음
    // --------------------------------------

    if (!placeId) {

        noPlaceId.push(event);

    }
    else {

        // ----------------------------------
        // 장소 매칭
        // ----------------------------------

        if (!placeMap.has(placeId)) {

            placeMatchFail.push(event);

        }
    }


    // --------------------------------------
    // 날짜 검사
    // --------------------------------------

    const startValid =
        isValidDate(startDate);

    const endValid =
        isValidDate(endDate);


    if (!startValid || !endValid) {

        invalidDateEvents.push(event);

        continue;
    }


    // --------------------------------------
    // 현재 / 예정
    //
    // 종료일이 오늘보다 같거나 크면
    // 현재 진행 중이거나 앞으로 예정된 행사
    // --------------------------------------

    if (endDate >= todayStr) {

        currentEvents.push(event);

    }
    else {

        pastEvents.push(event);

    }
}


// ==========================================
// 사하구 / 부산진구 행사 찾기
// ==========================================

for (const event of currentEvents) {

    const placeId =
        normalize(event.place_id);

    if (!placeId) {
        continue;
    }


    const place =
        placeMap.get(placeId);


    if (!place) {
        continue;
    }


    const district =
        normalize(place.sigungu);


    if (
        district === "사하구" ||
        district === "부산진구"
    ) {

        districtEvents.push({
            event: event,
            place: place
        });

    }
}


// ==========================================
// 장소별 행사 수
// ==========================================

const eventCountByPlace =
    new Map();

for (const event of currentEvents) {

    const placeId =
        normalize(event.place_id);

    if (!placeId) {
        continue;
    }


    const count =
        eventCountByPlace.get(placeId) || 0;

    eventCountByPlace.set(
        placeId,
        count + 1
    );
}


// ==========================================
// 콘솔 출력
// ==========================================

console.log("");
console.log("==========================================");
console.log(" 부산문화 데이터 분석 결과");
console.log("==========================================");


// ------------------------------------------
// 장소
// ------------------------------------------

console.log("");
console.log("[ 장소 데이터 ]");

console.log(
    `전체 장소 : ${places.length}`
);

console.log(
    `사하구 : ${
        places.filter(
            p => normalize(p.sigungu) === "사하구"
        ).length
    }`
);

console.log(
    `부산진구 : ${
        places.filter(
            p => normalize(p.sigungu) === "부산진구"
        ).length
    }`
);


// ------------------------------------------
// 좌표
// ------------------------------------------

console.log("");
console.log("[ 좌표 / 주소 품질 ]");

console.log(
    `위도 없음 : ${nullLat.length}`
);

console.log(
    `경도 없음 : ${nullLng.length}`
);

console.log(
    `위도 범위 이상 : ${invalidLat.length}`
);

console.log(
    `경도 범위 이상 : ${invalidLng.length}`
);

console.log(
    `위도 = 경도 : ${sameLatLng.length}`
);

console.log(
    `주소 없음 : ${emptyAddr.length}`
);


// ------------------------------------------
// 행사
// ------------------------------------------

console.log("");
console.log("[ 행사 데이터 ]");

console.log(
    `전체 행사 : ${events.length}`
);

console.log(
    `현재/예정 행사 : ${currentEvents.length}`
);

console.log(
    `과거 행사 : ${pastEvents.length}`
);

console.log(
    `날짜 이상/확인 필요 : ${invalidDateEvents.length}`
);


// ------------------------------------------
// 장소 연결
// ------------------------------------------

console.log("");
console.log("[ 행사 ↔ 장소 연결 ]");

console.log(
    `place_id 있음 : ${
        events.length - noPlaceId.length
    }`
);

console.log(
    `place_id 없음 : ${noPlaceId.length}`
);

console.log(
    `place_id 있지만 장소 매칭 실패 : ${
        placeMatchFail.length
    }`
);


// ------------------------------------------
// 사하구 / 부산진구
// ------------------------------------------

const sahaCount =
    districtEvents.filter(
        item =>
            normalize(item.place.sigungu) === "사하구"
    ).length;

const busanjinCount =
    districtEvents.filter(
        item =>
            normalize(item.place.sigungu) === "부산진구"
    ).length;


console.log("");
console.log("[ 대상 지역 행사 ]");

console.log(
    `사하구 현재/예정 행사 : ${sahaCount}`
);

console.log(
    `부산진구 현재/예정 행사 : ${busanjinCount}`
);

console.log(
    `사하구 + 부산진구 : ${districtEvents.length}`
);


// ==========================================
// 장르별 현재/예정 행사
// ==========================================

const genreCount =
    new Map();

for (const item of districtEvents) {

    const genre =
        normalize(item.event.prg_nm) || "기타";

    const count =
        genreCount.get(genre) || 0;

    genreCount.set(
        genre,
        count + 1
    );
}


console.log("");
console.log("[ 사하구 + 부산진구 장르별 행사 ]");

for (
    const [genre, count]
    of genreCount
) {

    console.log(
        `${genre} : ${count}`
    );
}


// ==========================================
// 현재/예정 행사 중 장소 매칭된 것
// ==========================================

const matchedDistrictEvents =
    districtEvents.filter(
        item => item.place
    );


// ==========================================
// 샘플 출력
// ==========================================

console.log("");
console.log("[ 대상 지역 행사 샘플 ]");

for (
    let i = 0;
    i < Math.min(10, matchedDistrictEvents.length);
    i++
) {

    const item =
        matchedDistrictEvents[i];

    console.log("");
    console.log(
        `${i + 1}. ${item.event.title}`
    );

    console.log(
        `   장르 : ${item.event.prg_nm}`
    );

    console.log(
        `   장소 : ${item.place.placeNm}`
    );

    console.log(
        `   구 : ${item.place.sigungu}`
    );

    console.log(
        `   기간 : ${item.event.op_st_dt} ~ ${item.event.op_ed_dt}`
    );

    console.log(
        `   무료/유료 : ${item.event.pay_at}`
    );

    console.log(
        `   place_id : ${item.event.place_id}`
    );
}


// ==========================================
// 종료
// ==========================================

console.log("");
console.log("==========================================");
console.log(" 분석 완료");
console.log("==========================================");