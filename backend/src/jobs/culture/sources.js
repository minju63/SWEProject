// 지도 탭 데이터 수집 원천 (SRS DP-MAP-01, DATA-MAP-01~05)
//   행사: 부산 문화 행사 목록 API 9개 장르 + 테마 API(장소 번호) + 장르별 상세 API
//   장소: 공연장·전시공간 목록 API(두 목록은 내용이 같아 공연장 목록만 받는다), 전국도서관표준데이터, 전국공공시설개방정보
//   청년공간: 부산청년플랫폼·사하구 청년창업 웹페이지 (youthSpaces.js)
import fs from 'node:fs';
import path from 'node:path';
import { getAll, getPage, sleep } from './dataGoKr.js';
import { crawlYouthSpaces } from './youthSpaces.js';

const BUSAN = 'https://apis.data.go.kr/6260000';
const busanUrl = (svc) => `${BUSAN}/${svc}/get${svc.replace(/Service$/, '')}`;

// 장르 순서가 행사 번호(event_id)를 정한다. 같은 res_no 가 여러 장르에 있으면 앞 장르로 본다
export const EVENT_GENRES = {
  play: 'Play',
  concert: 'Concert',
  dance: 'Dance',
  musical: 'Musical',
  classic: 'Classic',
  exhibit: 'Exhibit',
  opera: 'Opera',
  tradition: 'Tradition',
  etc: 'Etc',
};

const isBusan = (x) => /부산/.test(`${x.rdnmadr ?? ''}${x.lnmadr ?? ''}`);

// 실제 공공데이터 API
export const apiSource = {
  name: 'api',
  eventList: (genre) => getAll(busanUrl(`BusanCulture${EVENT_GENRES[genre]}Service`)),
  themes: () => getAll(busanUrl('BusanCultureThemeService')),
  async eventDetail(genre, resNo) {
    const svc = `BusanCulture${EVENT_GENRES[genre]}DetailService`;
    const { items } = await getPage(busanUrl(svc), { pageNo: 1, numOfRows: 10, res_no: resNo });
    await sleep(250);
    return items.find((it) => String(it.res_no) === String(resNo)) ?? null;
  },
  performPlaces: () => getAll(busanUrl('BusanCulturePerformPlaceService')),
  libraries: () =>
    getAll('https://api.data.go.kr/openapi/tn_pubr_public_lbrry_api', {
      type: 'json',
      ctprvnNm: '부산광역시',
    }),
  async publicFacilities() {
    // 시·도 조건이 듣지 않아 전국을 받은 뒤 부산 주소만 남긴다
    const all = await getAll('https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api', {
      type: 'json',
    });
    return all.filter(isBusan);
  },
  youthSpaces: crawlYouthSpaces,
};

// 저장해 둔 응답으로 실행 (API 장애·호출 한도 때 변환 점검용). busan-culture-api/data 폴더 구조
//   list/{장르}.json, list/theme.json, list/performPlace.json, detail/{장르}_{res_no}.json,
//   facility/lbrry_busan.json, facility/pblfclt_busan.json
export function cacheSource(dir) {
  const read = (...p) => {
    const file = path.join(dir, ...p);
    if (!fs.existsSync(file)) throw new Error(`저장된 응답 없음: ${p.join('/')}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  return {
    name: `cache(${dir})`,
    eventList: async (genre) => read('list', `${genre}.json`),
    themes: async () => read('list', 'theme.json'),
    async eventDetail(genre, resNo) {
      const file = path.join(dir, 'detail', `${genre}_${resNo}.json`);
      if (!fs.existsSync(file)) throw new Error('저장된 상세 응답 없음');
      return JSON.parse(fs.readFileSync(file, 'utf8')).item ?? null;
    },
    performPlaces: async () => read('list', 'performPlace.json'),
    libraries: async () => read('facility', 'lbrry_busan.json'),
    publicFacilities: async () => read('facility', 'pblfclt_busan.json').filter(isBusan),
    youthSpaces: async () => {
      throw new Error('청년공간 웹페이지는 저장된 응답이 없음');
    },
  };
}
