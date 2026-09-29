require('dotenv').config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
    ignoreAttributes: false
});

// =====================================================
// 1. 공공데이터포털 인증키
// =====================================================
// 반드시 본인 인증키 입력
// 인증키를 GitHub 등에 올리지 마세요.

const SERVICE_KEY = process.env.API_KEY;


// =====================================================
// 2. 기본 설정
// =====================================================

const BASE_URL = "https://apis.data.go.kr/6260000";

// 한 번에 가져올 데이터 개수
const NUM_OF_ROWS = 1000;

// 목록 API만 먼저 수집
// true로 변경하면 상세 API도 나중에 실행
const RUN_DETAIL_API = false;

// API 요청 사이 대기시간(ms)
// 너무 빠르게 호출하지 않기 위해 약간 기다림
const DELAY_MS = 300;


// =====================================================
// 3. API 목록
// =====================================================

const LIST_APIS = {

    play: {
        name: "연극",
        url:
            `${BASE_URL}/BusanCulturePlayService/getBusanCulturePlay`
    },

    concert: {
        name: "콘서트",
        url:
            `${BASE_URL}/BusanCultureConcertService/getBusanCultureConcert`
    },

    dance: {
        name: "무용",
        url:
            `${BASE_URL}/BusanCultureDanceService/getBusanCultureDance`
    },

    performPlace: {
        name: "공연장",
        url:
            `${BASE_URL}/BusanCulturePerformPlaceService/getBusanCulturePerformPlace`
    },

    musical: {
        name: "뮤지컬",
        url:
            `${BASE_URL}/BusanCultureMusicalService/getBusanCultureMusical`
    },

    classic: {
        name: "클래식",
        url:
            `${BASE_URL}/BusanCultureClassicService/getBusanCultureClassic`
    },

    exhibit: {
        name: "전시",
        url:
            `${BASE_URL}/BusanCultureExhibitService/getBusanCultureExhibit`
    },

    exhibitPlace: {
        name: "전시공간",
        url:
            `${BASE_URL}/BusanCultureExhibitPlaceService/getBusanCultureExhibitPlace`
    },

    opera: {
        name: "오페라",
        url:
            `${BASE_URL}/BusanCultureOperaService/getBusanCultureOpera`
    },

    tradition: {
        name: "전통예술",
        url:
            `${BASE_URL}/BusanCultureTraditionService/getBusanCultureTradition`
    },

    cultureDay: {
        name: "문화가 있는 날",
        url:
            `${BASE_URL}/BusanCultureDayService/getBusanCultureDay`
    },

    etc: {
        name: "기타장르",
        url:
            `${BASE_URL}/BusanCultureEtcService/getBusanCultureEtc`
    },

    themeCode: {
        name: "테마코드",
        url:
            `${BASE_URL}/BusanCultureThemeCodeService/getBusanCultureThemeCode`
    },

    theme: {
        name: "공연전시 테마",
        url:
            `${BASE_URL}/BusanCultureThemeService/getBusanCultureTheme`
    }
};


// =====================================================
// 4. 상세 API
// =====================================================

const DETAIL_APIS = {

    playDetail: {
        name: "연극 상세",
        url:
            `${BASE_URL}/BusanCulturePlayDetailService/getBusanCulturePlayDetail`,
        listKey: "play"
    },

    concertDetail: {
        name: "콘서트 상세",
        url:
            `${BASE_URL}/BusanCultureConcertDetailService/getBusanCultureConcertDetail`,
        listKey: "concert"
    },

    danceDetail: {
        name: "무용 상세",
        url:
            `${BASE_URL}/BusanCultureDanceDetailService/getBusanCultureDanceDetail`,
        listKey: "dance"
    },

    musicalDetail: {
        name: "뮤지컬 상세",
        url:
            `${BASE_URL}/BusanCultureMusicalDetailService/getBusanCultureMusicalDetail`,
        listKey: "musical"
    },

    classicDetail: {
        name: "클래식 상세",
        url:
            `${BASE_URL}/BusanCultureClassicDetailService/getBusanCultureClassicDetail`,
        listKey: "classic"
    },

    exhibitDetail: {
        name: "전시 상세",
        url:
            `${BASE_URL}/BusanCultureExhibitDetailService/getBusanCultureExhibitDetail`,
        listKey: "exhibit"
    },

    operaDetail: {
        name: "오페라 상세",
        url:
            `${BASE_URL}/BusanCultureOperaDetailService/getBusanCultureOperaDetail`,
        listKey: "opera"
    },

    traditionDetail: {
        name: "전통예술 상세",
        url:
            `${BASE_URL}/BusanCultureTraditionDetailService/getBusanCultureTraditionDetail`,
        listKey: "tradition"
    },

    etcDetail: {
        name: "기타장르 상세",
        url:
            `${BASE_URL}/BusanCultureEtcDetailService/getBusanCultureEtcDetail`,
        listKey: "etc"
    }
};


// =====================================================
// 5. 폴더 생성
// =====================================================

const DATA_DIR = path.join(__dirname, "data");
const LIST_DIR = path.join(DATA_DIR, "list");
const DETAIL_DIR = path.join(DATA_DIR, "detail");
const ERROR_DIR = path.join(DATA_DIR, "error");

fs.mkdirSync(LIST_DIR, { recursive: true });
fs.mkdirSync(DETAIL_DIR, { recursive: true });
fs.mkdirSync(ERROR_DIR, { recursive: true });


// =====================================================
// 6. 잠깐 기다리기
// =====================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// =====================================================
// 7. 응답에서 item 뽑기
// =====================================================

function extractItems(data) {

    // JSON 응답
    if (typeof data === "object") {

        let items =
            data?.response?.body?.items?.item ??
            data?.response?.items?.item ??
            data?.body?.items?.item ??
            data?.items?.item ??
            [];

        if (!items) {
            return [];
        }

        if (!Array.isArray(items)) {
            items = [items];
        }

        return items;
    }


    // XML 응답
    if (typeof data === "string") {

        const trimmed = data.trim();

        if (trimmed.startsWith("<")) {

            const parsed = xmlParser.parse(trimmed);

            let items =
                parsed?.response?.body?.items?.item ??
                parsed?.response?.items?.item ??
                [];

            if (!items) {
                return [];
            }

            if (!Array.isArray(items)) {
                items = [items];
            }

            return items;
        }

        // JSON 문자열인 경우
        try {

            const parsed = JSON.parse(trimmed);

            return extractItems(parsed);

        } catch {

            return [];
        }
    }

    return [];
}


// =====================================================
// 8. totalCount 가져오기
// =====================================================

function extractTotalCount(data) {

    if (typeof data === "object") {

        return Number(
            data?.response?.body?.totalCount ??
            data?.response?.totalCount ??
            data?.body?.totalCount ??
            data?.totalCount ??
            0
        );
    }


    if (typeof data === "string") {

        const trimmed = data.trim();

        if (trimmed.startsWith("<")) {

            const parsed =
                xmlParser.parse(trimmed);

            return Number(
                parsed?.response?.body?.totalCount ??
                parsed?.response?.totalCount ??
                0
            );
        }

        try {

            const parsed =
                JSON.parse(trimmed);

            return extractTotalCount(parsed);

        } catch {

            return 0;
        }
    }

    return 0;
}


// =====================================================
// 9. API 한 개 전체 수집
// =====================================================

async function fetchAll(api) {

    let pageNo = 1;

    let allItems = [];

    let totalCount = 0;

    while (true) {

        console.log(
            `    page ${pageNo} 요청 중...`
        );

        try {

            const response = await axios.get(api.url, {

                params: {
                    ServiceKey: SERVICE_KEY,
                    pageNo: pageNo,
                    numOfRows: NUM_OF_ROWS
                },

                responseType: "text",

                timeout: 30000
            });


            const data = response.data;


            // -------------------------------
            // 응답 결과 확인
            // -------------------------------

            const resultCode =
                data?.response?.header?.resultCode;

            const resultMsg =
                data?.response?.header?.resultMsg;


            if (
                resultCode &&
                resultCode !== "00" &&
                resultCode !== "000"
            ) {

                console.log(
                    `    ❌ API 오류: ${resultCode} / ${resultMsg}`
                );

                return allItems;
            }


            // -------------------------------
            // 데이터 추출
            // -------------------------------

            const items = extractItems(data);

            totalCount = extractTotalCount(data);

            allItems.push(...items);


            console.log(
                `    ${items.length}건 / 누적 ${allItems.length}건 / 전체 ${totalCount}건`
            );


            // -------------------------------
            // 종료 조건
            // -------------------------------

            if (items.length === 0) {
                break;
            }

            if (
                totalCount > 0 &&
                allItems.length >= totalCount
            ) {
                break;
            }


            pageNo++;

            await sleep(DELAY_MS);

        }

        catch (error) {

            console.log(
                `    ❌ 요청 실패`
            );


            if (error.response) {

                console.log(
                    "    HTTP 상태:",
                    error.response.status
                );

                console.log(
                    error.response.data
                );

            } else {

                console.log(
                    error.message
                );
            }


            // 에러 내용을 파일로 저장
            const errorFile =
                path.join(
                    ERROR_DIR,
                    `${api.name}.txt`
                );

            fs.writeFileSync(
                errorFile,
                String(
                    error.response?.data ||
                    error.message ||
                    error
                ),
                "utf8"
            );

            break;
        }
    }

    return allItems;
}


// =====================================================
// 10. 목록 API 전체 수집
// =====================================================

async function collectListApis() {

    const results = {};

    console.log("");
    console.log("==========================================");
    console.log(" 부산문화 목록 API 수집 시작");
    console.log("==========================================");


    for (
        const [key, api]
        of Object.entries(LIST_APIS)
    ) {

        console.log("");
        console.log(
            `===== ${api.name} =====`
        );

        console.log(
            `URL: ${api.url}`
        );


        const items =
            await fetchAll(api);


        results[key] = items;


        // -------------------------------
        // JSON 파일 저장
        // -------------------------------

        const filePath =
            path.join(
                LIST_DIR,
                `${key}.json`
            );


        fs.writeFileSync(
            filePath,
            JSON.stringify(
                items,
                null,
                2
            ),
            "utf8"
        );


        console.log(
            `✅ 저장 완료: ${filePath}`
        );

        console.log(
            `✅ 총 ${items.length}건`
        );
    }


    return results;
}


// =====================================================
// 11. 상세 API용 ID 추출
// =====================================================

function getResNos(items) {

    const ids = [];

    for (const item of items) {

        const resNo =
            item?.res_no;

        if (
            resNo !== undefined &&
            resNo !== null
        ) {

            const value =
                String(resNo).trim();


            if (
                value !== "" &&
                !ids.includes(value)
            ) {

                ids.push(value);
            }
        }
    }


    return ids;
}


// =====================================================
// 12. 상세 API 수집
// =====================================================

async function fetchDetails(api, listItems) {

    const ids =
        getResNos(listItems);


    console.log(
        `    상세조회 대상: ${ids.length}건`
    );


    const results = [];


    for (
        let i = 0;
        i < ids.length;
        i++
    ) {

        const resNo = ids[i];


        console.log(
            `    [${i + 1}/${ids.length}] res_no=${resNo}`
        );


        try {

            const response =
                await axios.get(
                    api.url,
                    {

                        params: {
                            ServiceKey: SERVICE_KEY,
                            pageNo: 1,
                            numOfRows: 10,
                            res_no: resNo,
                            resultType: "json"
                        },

                        timeout: 30000
                    }
                );


            const items =
                extractItems(
                    response.data
                );


            results.push(...items);


            await sleep(DELAY_MS);

        }

        catch (error) {

            console.log(
                `    ❌ 상세조회 실패: ${resNo}`
            );


            const errorFile =
                path.join(
                    ERROR_DIR,
                    `${api.name}_${resNo}.txt`
                );


            fs.writeFileSync(
                errorFile,
                String(
                    error.response?.data ||
                    error.message ||
                    error
                ),
                "utf8"
            );
        }
    }


    return results;
}


// =====================================================
// 13. 상세 API 전체 실행
// =====================================================

async function collectDetailApis(listResults) {

    console.log("");
    console.log("==========================================");
    console.log(" 부산문화 상세 API 수집 시작");
    console.log("==========================================");


    for (
        const [key, api]
        of Object.entries(DETAIL_APIS)
    ) {

        console.log("");
        console.log(
            `===== ${api.name} =====`
        );


        const listItems =
            listResults[api.listKey];


        if (!listItems) {

            console.log(
                "    연결된 목록 데이터가 없습니다."
            );

            continue;
        }


        const detailItems =
            await fetchDetails(
                api,
                listItems
            );


        const filePath =
            path.join(
                DETAIL_DIR,
                `${key}.json`
            );


        fs.writeFileSync(
            filePath,
            JSON.stringify(
                detailItems,
                null,
                2
            ),
            "utf8"
        );


        console.log(
            `✅ 저장 완료: ${filePath}`
        );


        console.log(
            `✅ 총 ${detailItems.length}건`
        );
    }
}


// =====================================================
// 14. 실행
// =====================================================

async function main() {

    // 인증키 확인
    if (
        !SERVICE_KEY ||
        SERVICE_KEY.includes(
            "여기에_본인"
        )
    ) {

        console.log(
            "❌ index.js 상단에 인증키를 입력하세요."
        );

        return;
    }


    console.log("");
    console.log("==========================================");
    console.log(" 부산 문화 데이터 수집기");
    console.log("==========================================");
    console.log("");


    // ----------------------------------
    // 1단계
    // 목록 API 전체 수집
    // ----------------------------------

    const listResults =
        await collectListApis();


    // ----------------------------------
    // 2단계
    // 상세 API
    // ----------------------------------

    if (RUN_DETAIL_API) {

        await collectDetailApis(
            listResults
        );

    } else {

        console.log("");
        console.log(
            "ℹ️ 상세 API는 현재 실행하지 않았습니다."
        );

        console.log(
            "ℹ️ RUN_DETAIL_API = true 로 변경하면 실행됩니다."
        );
    }


    // ----------------------------------
    // 완료
    // ----------------------------------

    console.log("");
    console.log("==========================================");
    console.log(" ✅ 전체 수집 작업 종료");
    console.log("==========================================");
    console.log("");
}


main();