/** 프로토타입 기준 "현재 시각" */
export const NOW = new Date(2026, 9, 6, 9, 41)
export const POLICIES = [
  {
    id: 'rent',
    title: '청년 월세 지원',
    meta: '10.09 (금) 18:00 · 부산광역시',
    deadline: new Date(2026, 9, 9, 18, 0),
    color: 0,
  },
  {
    id: 'bus',
    title: '청년 교통비 지원',
    meta: '10.13 (화) · 사하구',
    deadline: new Date(2026, 9, 13, 18, 0),
    color: 0,
  },
  {
    id: 'scholar',
    title: '지역인재 장학금',
    meta: '10.17 (토) · 전국',
    deadline: new Date(2026, 9, 17, 18, 0),
    color: 2,
  },
  {
    id: 'job',
    title: '청년 취업 성공 패키지',
    meta: '10.22 (목) · 부산광역시',
    deadline: new Date(2026, 9, 22, 18, 0),
    color: 3,
  },
  {
    id: 'culture',
    title: '청년 문화패스',
    meta: '10.22 (목) · 부산광역시',
    deadline: new Date(2026, 9, 22, 18, 0),
    color: 1,
  },
  {
    id: 'house',
    title: '청년 전세 이자 지원',
    meta: '10.29 (목) · 부산광역시',
    deadline: new Date(2026, 9, 29, 18, 0),
    color: 4,
  },
]
/** quick-add alarm labels (also used as default-alarm chips) */
export const QUICK = ['1주 전', '3일 전', '1일 전', '당일 9시', '1시간 전', '30분 전']
/* ---------- 찜 · 알림 기본값 (localStorage 비어 있을 때) ---------- */
export const DEFAULT_LIKES = ['rent', 'bus', 'scholar', 'job', 'culture', 'house']
export const DEFAULT_ALARMS = {
  rent: ['1일 전', '30분 전'],
  bus: ['3일 전', '당일 9시', '1시간 전'],
}
export const DEFAULT_SETTINGS = {
  auto: ['1일 전', '30분 전'],
  receive: [true, true, true],
}
/* ---------- 캘린더 카드 부가 정보 (D-day, 서류 진행) ---------- */
export const POLICY_EXTRA = {
  rent: { days: 4, docs: [1, 4] },
  bus: { days: 8, docs: [1, 2] },
  scholar: { days: 12 },
  job: { days: 17 },
  culture: { days: 17 },
  house: { days: 24 },
}
/* ---------- 홈 ---------- */
export const DEADLINES = [
  {
    id: 'rent',
    days: 4,
    title: '청년 월세 지원',
    meta: '10.09 (금) 18:00 · 부산광역시',
    done: 1,
    total: 4,
    liked: true,
  },
  {
    id: 'bus',
    days: 8,
    title: '청년 교통비 지원',
    meta: '10.13 (화) · 사하구',
    done: 1,
    total: 2,
    liked: true,
  },
]
export const BENEFITS = [
  {
    id: 'b1',
    status: 'ok',
    region: '부산광역시',
    days: 4,
    title: '청년 월세 지원',
    desc: '무주택 청년 월 최대 20만 원, 12개월 지원',
    liked: true,
  },
  {
    id: 'b2',
    status: 'ok',
    region: '사하구',
    days: 11,
    title: '청년 이사비 지원',
    desc: '전입 청년 이사비·중개수수료 최대 40만 원',
  },
  {
    id: 'b3',
    status: 'check',
    region: '부산광역시',
    days: 19,
    title: '청년 전세자금 대출이자 지원',
    desc: '소득 조건 확인 필요 · 대출이자 연 최대 2%',
  },
]
export const ALL_BENEFITS = [
  BENEFITS[0],
  {
    id: 'a2',
    status: 'no',
    region: '해운대구',
    days: 6,
    title: '해운대 청년 주거 상담',
    desc: '해운대구 거주 청년 대상 1:1 주거 상담·계약 검토',
  },
]
export const COUNTS = [17, 12, 9, 6, 5]
export const ALL_COUNTS = [64, 86, 71, 53, 38]
export const PCTS = [35, 24, 18, 12, 10]
/* ---------- 알림 센터 ---------- */
export const NOTI_NEW = [
  {
    icon: 'alarm',
    color: '#EF4E6C',
    bg: '#FDE9ED',
    title: '찜한 "청년 월세 지원" 마감 30분 전이에요',
    sub: '오늘 18:00 마감 · 서류 1/4 준비',
    time: '방금',
  },
  {
    icon: 'sparkles',
    color: '#2F7BF5',
    bg: '#EAF2FE',
    title: '새로 맞는 혜택 1건이 생겼어요',
    sub: '사하구 청년 마음건강 상담 · 신청 가능',
    time: '2시간 전',
  },
]
export const NOTI_OLD = [
  {
    title: '청년 교통비 지원 마감 3일 전이에요',
    sub: '10.13 (화) 마감',
    time: '어제',
  },
  {
    title: '청년 월세 지원 내일 마감이에요',
    sub: '서류 0/4 준비',
    time: '10.04',
  },
]
