const fs = require("fs");
const path = require("path");

const DATA_DIR = "./data/list";

const files = fs
    .readdirSync(DATA_DIR)
    .filter(file => file.endsWith(".json"));

for (const file of files) {

    const filePath = path.join(DATA_DIR, file);

    const data = JSON.parse(
        fs.readFileSync(filePath, "utf8")
    );

    console.log("");
    console.log("========================================");
    console.log(file);
    console.log("전체 데이터:", data.length);
    console.log("========================================");

    if (data.length === 0) {
        console.log("데이터 없음");
        continue;
    }

    // -----------------------------
    // 필드 목록
    // -----------------------------

    const keys = new Set();

    for (const item of data) {
        Object.keys(item).forEach(key => {
            keys.add(key);
        });
    }

    console.log("\n[필드]");
    console.log([...keys].join(", "));


    // -----------------------------
    // 첫 번째 데이터
    // -----------------------------

    console.log("\n[첫 번째 데이터]");
    console.log(
        JSON.stringify(data[0], null, 2)
    );


    // -----------------------------
    // 두 번째 데이터
    // -----------------------------

    if (data.length > 1) {
        console.log("\n[두 번째 데이터]");
        console.log(
            JSON.stringify(data[1], null, 2)
        );
    }


    // -----------------------------
    // 주요 필드 존재 여부
    // -----------------------------

    const checkFields = [
        "sigungu",
        "gugun",
        "addr",
        "address",
        "road_address",
        "lat",
        "lng",
        "lttd",
        "lngt",
        "place_id",
        "place_nm",
        "res_no",
        "title",
        "tel",
        "homepage",
        "url"
    ];

    console.log("\n[주요 필드 존재 개수]");

    for (const field of checkFields) {

        let count = 0;

        for (const item of data) {

            const value = item[field];

            if (
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
            ) {
                count++;
            }
        }

        if (count > 0) {
            console.log(
                `${field}: ${count}/${data.length}`
            );
        }
    }
}