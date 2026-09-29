# busan-culture-api

부산 문화 공공데이터(공연·전시 등)를 수집하고, **사하구·부산진구** 대상 장소/행사만 정제·검증하는 Node.js 스크립트 모음입니다.

## 1. 환경 설정

필요한 것: **Node.js 18 이상** (개발 환경: v22), npm, 아래 두 API 키

```bash
cd busan-culture-api
npm install                # axios, dotenv, fast-xml-parser 설치
cp .env.example .env       # Windows CMD: copy .env.example .env
```

`.env` 파일을 열어 키를 채웁니다. **`.env`는 절대 git에 올리지 마세요.**

## 2. 실행 순서

`data/` 폴더는 용량 때문에 git에 올리지 않습니다. 아래 순서대로 실행하면 직접 만들어집니다.

```bash
node index.js           # 1) 전체 목록 수집      -> data/list/*.json
node cleanCulture.js    # 2) 대상 지역 1차 정제  -> data/clean/places.json, events.json
node verifyPlaces.js    # 3) 카카오 좌표 검증    -> data/clean/places_verified.json
node fetchDetails.js    # 4) 행사 상세 수집      -> data/clean/event_details.json
```

`index.js`는 API 호출이 많아 시간이 걸립니다(요청 간 300ms 대기). 상세 API까지 받으려면 `index.js`의 `RUN_DETAIL_API`를 `true`로 바꿉니다.

## 3. 파일별 역할

### 파이프라인 (데이터를 만들어내는 스크립트)

| 파일 | 역할 | 입력 → 출력 |
|---|---|---|
| `index.js` | 공공데이터포털 부산 문화 API 전체 수집 (연극·콘서트·무용·뮤지컬·클래식·오페라·전시·전통예술·기타·공연장·전시공간·문화가있는날·테마 등) | API → `data/list/*.json` |
| `cleanCulture.js` | 사하구/부산진구 장소와 현재·예정 행사만 추출. 구(district)는 주소에서 파싱, 좌표 이상치 표시 | `data/list` → `data/clean/places.json`, `events.json` |
| `verifyPlaces.js` | 카카오 API로 주소↔좌표 교차검증 (허용 거리 300m). 상태값: verified / coord_only / review / fixed / replaced / manual | `places.json` → `places_verified.json` |
| `fetchDetails.js` | 정제된 행사의 상세 정보를 장르별 상세 API(전시·클래식·오페라)로 수집 | `events.json` → `event_details.json` |

### 점검·분석용 (파일을 만들지 않고 콘솔에만 출력)

| 파일 | 역할 |
|---|---|
| `analyzeStatus.js` | `data/list` 전체를 읽어 종류를 자동 판별하고 프로젝트 데이터 현황을 한 번에 출력 |
| `analyzeData.js` | `data/list` 각 파일의 건수·필드 구성 확인 |
| `analyzeCulture.js` | 공연장/테마 데이터 기준으로 오늘 날짜 이후 행사 등을 분석 |
| `checkPerformPlace.js` | 공연장 데이터의 좌표 누락·범위 이상·주소 누락 등 품질 점검 |
| `resolveMissingPlaces.js` | 공연장 목록과 매칭되지 않는 행사의 장소를 카카오 키워드 검색으로 찾아보는 확인용 스크립트 |
| `probeDetail.js` | 상세 API 응답 구조를 확인하려고 만든 1회성 탐색 스크립트 |

## 4. 폴더 구조

```
busan-culture-api/
├─ index.js, cleanCulture.js, verifyPlaces.js, fetchDetails.js   # 파이프라인
├─ analyze*.js, check*.js, resolveMissingPlaces.js, probeDetail.js  # 점검·탐색용
├─ data/                 # (git 제외) 실행하면 생성
│  ├─ list/              # 원본 수집 데이터
│  └─ clean/             # 정제·검증 결과
├─ package.json
├─ .env.example          # 환경변수 템플릿
└─ .env                  # (git 제외) 본인 API 키
```

## 5. 주의사항

- `.env`(API 키), `node_modules/`, `data/`는 `.gitignore`로 제외되어 있습니다.
- 스크립트는 `data/list` 등 상대경로를 사용하는 것이 있으니 **반드시 `busan-culture-api` 폴더 안에서** 실행하세요.
- `coord_status: ok`는 로컬 규칙 통과일 뿐이며, `verifyPlaces.js`를 거치기 전에는 검증 완료가 아닙니다.
