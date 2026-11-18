export const GENRE_LABEL = { classic: '클래식', exhibit: '전시', opera: '오페라' }
const TODAY_DATE = new Date()
const pad = (n) => String(n).padStart(2, '0')
export const TODAY = `${TODAY_DATE.getFullYear()}-${pad(TODAY_DATE.getMonth() + 1)}-${pad(TODAY_DATE.getDate())}`
const link = (genre, id) =>
  `http://busandabom.net/play/view.nm?lang=ko&url=play&menuCd=${genre === 'exhibit' ? 8 : 5}&res_no=${id}`
function E(genre, id, title, placeId, start, end, price, showtime, extra = {}) {
  return {
    id: `${genre}-${id}`,
    genre,
    title,
    placeId,
    start,
    end,
    isFree: /무료/.test(price) && !/불가/.test(price),
    price,
    showtime,
    detailUrl: link(genre, id),
    collectedAt: '2026-09-30',
    ...extra,
  }
}
const HALL = 'CUL-FC004296'
const MOCA = 'CUL-BCP00090'
const HONGTI = 'CUL-BCP00105'
const HONGTI_VILLAGE = 'CUL-BCP00127'
const MG = 'CUL-FC004877'
const IFACE = 'CUL-BCP00401'
const ABU = 'CUL-FC004882'
const BGAL = 'CUL-FC002803'
export const EVENTS = [
  E(
    'classic',
    '2026060125',
    '클래식부산 마티네 콘서트, 지휘자 김광현의 오페라 톡톡: 카르멘',
    HALL,
    '2026-11-25',
    '2026-11-25',
    '전석 20,000원',
    '수요일(11:00)',
    {
      rating: '만 7세 이상',
      runtime: '1시간 10분',
      enterprise: '클래식부산',
      casting: '김광현, 남수지, 김진훈, 이지헌, 장양진, 윤태희, 신동원 등',
    }
  ),
  E(
    'classic',
    '2026060260',
    '지브리 영화음악 FESTA',
    HALL,
    '2026-12-05',
    '2026-12-05',
    'VIP석 100,000원, R석 80,000원, S석 60,000원, A석 50,000원, 시야방해 VIP석 70,000원, 시야방해 S석 50,000원, 시야방해 A석 40,000원',
    '토요일(14:00)',
    { rating: '만 4세 이상', runtime: '2시간', enterprise: '필뮤직 컴퍼니', casting: '백윤학 등' }
  ),
  E(
    'classic',
    '2026070071',
    '랑랑 피아노 리사이틀 - 부산',
    HALL,
    '2026-10-13',
    '2026-10-13',
    'R석 200,000원, S석 170,000원, A석 140,000원, B석 110,000원, C석 80,000원, 시야방해 S석 119,000원, 시야방해 A석 98,000원, 시야방해 B석 77,000원, 시야방해 C석 56,000원',
    '(화) 오후 7:30',
    {
      rating: '초등학생 이상 관람가(2019년생 포함 이전 출생자)',
      runtime: '120분 (인터미션 20분 포함)',
      casting: '랑랑(Lang Lang)',
    }
  ),
  E(
    'classic',
    '2026070159',
    '낭만주의 거장, 차이코프스키',
    HALL,
    '2026-11-06',
    '2026-11-06',
    'VIP석 120,000원, R석 90,000원, S석 70,000원, A석 50,000원',
    '금요일(19:30)',
    {
      rating: '만 7세 이상',
      runtime: '2시간 30분',
      enterprise: '두남재엔터테인먼트(주)',
      casting: '최영선, 임지영, 세르게이 타라소프 등',
    }
  ),
  E(
    'classic',
    '2026080084',
    '베토벤의 생애를 관통하는 세 개의 피아노 협주곡: 위대한 베토벤',
    HALL,
    '2026-11-29',
    '2026-11-29',
    'VIP석 120,000원, R석 90,000원, S석 70,000원, A석 50,000원',
    '일요일(16:00)',
    {
      rating: '만 7세 이상',
      runtime: '2시간 30분',
      enterprise: '두남재엔터테인먼트(주)',
      casting: '최영선, 일리야 라쉬코프스키 등',
    }
  ),
  E(
    'classic',
    '2026080118',
    '빈 필하모닉 내한공연, 투간 소키에프 & 조성진',
    HALL,
    '2026-10-26',
    '2026-10-26',
    'R석 500,000원, S석 400,000원, A석 300,000원, B석 200,000원, C석 100,000원, 시야제한석 100,000원',
    '월요일(19:30)',
    { rating: '만 7세 이상', runtime: '2시간', casting: '투간 소키에프, 조성진 등' }
  ),
  E(
    'classic',
    '2026080154',
    '크리스마스 영화음악 & 캐롤 FESTA',
    HALL,
    '2026-12-13',
    '2026-12-13',
    'VIP석 100,000원, R석 80,000원, S석 60,000원, A석 50,000원, 시야방해VIP석 80,000원, 시야방해S석 50,000원, 시야방해A석 40,000원',
    '일요일(18:00)',
    {
      rating: '만 4세 이상',
      runtime: '2시간',
      enterprise: '필뮤직 컴퍼니',
      casting: '백윤학, 이희주 등',
    }
  ),
  E(
    'classic',
    '2026080158',
    '손민수 피아노 리사이틀',
    HALL,
    '2026-10-18',
    '2026-10-18',
    'R석 50,000원, 학생석 10,000원',
    '일요일(17:00)',
    { rating: '만 7세 이상', runtime: '2시간 15분', enterprise: '클래식부산', casting: '손민수' }
  ),
  E(
    'classic',
    '2026080173',
    '콘서트오페라, 오텔로',
    HALL,
    '2026-10-10',
    '2026-10-11',
    'R석 120,000원, S석 90,000원, A석 70,000원, B석 50,000원, C석 30,000원, 학생석 10,000원',
    '토요일 ~ 일요일(17:00)',
    {
      rating: '만 7세 이상',
      runtime: '2시간 40분',
      casting: '그레고리 쿤테, 손지혜, 젤리코 루치치, 황준호, 사비나 킴, 김재일, 김철준 등',
      crew: '정명훈, 표현진, 김현정 등',
    }
  ),
  E(
    'classic',
    '2026080203',
    '제634회 부산시립교향악단 정기 연주회',
    HALL,
    '2026-10-16',
    '2026-10-16',
    'R석 30,000원, S석 20,000원, A석 10,000원',
    '금요일(19:30)',
    { rating: '만 7세 이상', runtime: '1시간 40분', casting: '여자경, 이관욱 등' }
  ),
  E(
    'classic',
    '2026090068',
    '제11회 KNN방송교향악단 정기연주회: 교향곡 마스터피스 시리즈, 피아니스트 임동혁 초청',
    HALL,
    '2026-11-07',
    '2026-11-07',
    'R석 100,000원, S석 70,000원, A석 50,000원, B석 30,000원',
    '토요일(19:30)',
    {
      rating: '만 7세 이상',
      runtime: '1시간 40분',
      enterprise: '(사) KNN방송교향악단',
      casting: '임동혁, 서희태 등',
    }
  ),
  E(
    'classic',
    '2026090098',
    '정명훈, 막심 벤게로프 & 도쿄 필하모닉',
    HALL,
    '2026-10-20',
    '2026-10-20',
    'R석 250,000원, S석 210,000원, A석 170,000원, B석 120,000원, C석 70,000원',
    '화요일(19:30)',
    {
      rating: '만 7세 이상',
      runtime: '1시간 40분',
      enterprise: '클래식부산',
      casting: '정명훈, 막심 벤게로프 등',
    }
  ),
  E(
    'classic',
    '2026090165',
    '플로리안 노악 피아노 리사이틀',
    HALL,
    '2026-11-26',
    '2026-11-26',
    'R석 3만원, S석 2만원',
    '평일 오후 7시 30분',
    {
      rating: '초등학생 이상 관람 (2019년 포함 이전 출생자)',
      runtime: '110분(인터미션 15분)',
      casting: '플로리안 노악(FLORIAN NOACK)',
    }
  ),
  E(
    'classic',
    '2026090166',
    '리드 테츨로프 피아노 리사이틀',
    HALL,
    '2026-12-08',
    '2026-12-08',
    'R석 3만원, S석 2만원',
    '평일 오후 7시 30분',
    {
      rating: '초등학생이상(2019년생 포함 이전 출생자)',
      runtime: '110분(인터미션 15분)',
      casting: '리드 테츨로프(REED TETZLOFF)',
    }
  ),
  E(
    'classic',
    '2026090167',
    '알버트 카노 스미트 피아노 리사이틀',
    HALL,
    '2026-12-09',
    '2026-12-09',
    'R석 3만원, S석 2만원',
    '수요일 오후 7시 30분',
    {
      rating: '초등학생 이상 관람 (2019년생 포함 이전 출생자)',
      runtime: '110분(인터미션 15분)',
      casting: '알버트 카노 스미트(ALBERT CANO SMIT)',
    }
  ),
  E(
    'opera',
    '2026090056',
    '송년 오페라 갈라 카르멘 VS 카르멘',
    HALL,
    '2026-12-12',
    '2026-12-12',
    'VIP석 120,000원, R석 80,000원, S석 50,000원, A석 30,000원, 학생석 10,000원',
    '토요일 19:00',
    {
      rating: '초등학생 이상 (2019년생 포함 이전 출생자)',
      runtime: '120분(인터미션 20분 포함)',
      casting: '카를로 빨레스키, 박지혜, 최승현, 신상근, 문정현, 박현정',
    }
  ),
  E(
    'exhibit',
    '2026050191',
    '2026년 홍티아트센터 입주작가 ∑Mmm(이음)전 - Serendipity: 우연이 의미가 되는 순간',
    HONGTI,
    '2026-04-29',
    '2026-11-25',
    '무료관람',
    '월 - 토 10:00 - 18:00'
  ),
  E(
    'exhibit',
    '2026080071',
    '2026부산비엔날레',
    MOCA,
    '2026-08-29',
    '2026-11-01',
    '일반 16,000원',
    '10:00 ~ 18:00 (입장마감 17:00)',
    { rating: '전체관람가' }
  ),
  E(
    'exhibit',
    '2026090089',
    '소장품섬_심준섭: 기관의 순환',
    MOCA,
    '2026-08-29',
    '2026-11-01',
    '무료관람',
    '화-일 10:00-18:00 (17:30 입장마감) (1월 1일, 월요일 휴관일)'
  ),
  E(
    'exhibit',
    '2026080232',
    'Color of Ocean',
    MG,
    '2026-08-05',
    '2026-10-02',
    '무료관람',
    '평일 9:00 ~ 18:00 (주말, 공휴일 제외)'
  ),
  E(
    'exhibit',
    '2026080238',
    '이원호 개인전 《얄궂게 파란》',
    IFACE,
    '2026-09-18',
    '2026-10-10',
    '무료관람',
    '오전 11시 ~ 오후 6시 (일요일·월요일 휴관)'
  ),
  E(
    'exhibit',
    '2026090137',
    '오셔닉 그래머 Oceanic Grammar',
    HONGTI,
    '2026-09-16',
    '2026-10-07',
    '무료관람',
    '월~토 10:00~18:00 (17:30 입장마감 | 10/3(토) 제외한 일요일, 공휴일 휴관)'
  ),
  E(
    'exhibit',
    '2026090140',
    '빈-ZIP Project #1',
    HONGTI_VILLAGE,
    '2026-09-01',
    '2026-09-30',
    '무료관람',
    '10:00 - 17:00 (일·월 및 공휴일 휴관)'
  ),
  E(
    'exhibit',
    '2026090144',
    '우리가 품은 무게에 대하여',
    HONGTI_VILLAGE,
    '2026-09-01',
    '2026-10-15',
    '무료관람',
    '10:00 - 18:00 (입장마감 17:30) (일·월 및 공휴일 휴관)'
  ),
  E(
    'exhibit',
    '2026090147',
    '시선의 결',
    ABU,
    '2026-08-11',
    '2026-10-30',
    '무료관람',
    '화 ~ 일 오전 10:00 ~ 오후 6:00 (월요일 휴무)',
    { rating: '전체 관람가' }
  ),
  E(
    'exhibit',
    '2026090150',
    '밝고도 어두운 빛',
    BGAL,
    '2026-09-19',
    '2026-09-30',
    '무료관람',
    '11:00~19:00, 월요일 휴관, 추석 연휴 개관'
  ),
  E(
    'exhibit',
    '2026090151',
    '무의식의 궤적 Traces df the Unconsclous',
    BGAL,
    '2026-10-02',
    '2026-10-15',
    '무료관람',
    '11:00~19:00, 월요일 휴관'
  ),
  E(
    'exhibit',
    '2026090152',
    '시간의 형상 -살아있는 장소의 초상, 유영 개인전',
    BGAL,
    '2026-10-27',
    '2026-11-08',
    '무료관람',
    '11:00~19:00 (월요일 휴관)'
  ),
]
export function eventsOf(placeId) {
  return EVENTS.filter((event) => event.placeId === placeId)
}
export function liveEvents(placeId) {
  return eventsOf(placeId)
    .filter((event) => event.end >= TODAY)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
}
export function isOngoing(event) {
  return event.start <= TODAY
}
export function eventPeriod(event) {
  const md = (value) => value.slice(5).replace('-', '.')
  return event.start !== event.end ? `${md(event.start)} ~ ${md(event.end)}` : md(event.start)
}
export function findEvent(id) {
  return EVENTS.find((event) => event.id === id) ?? null
}
