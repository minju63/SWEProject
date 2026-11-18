// 개발용 샘플 데이터: /calendar?preview=1 (개발 서버에서만). 로그인 없이 화면을 확인할 때 쓴다.
// 날짜는 오늘 기준으로 만들어서 언제 열어도 마감 임박·지난 일정이 골고루 보인다.
import { addDaysKey, dateKey, kstParts } from './calendarUtils.js';

const p = kstParts(new Date());
const today = dateKey(p.y, p.m, p.d);
const at = (n) => addDaysKey(today, n);

const item = (id, title, cat, endOffset, extra = {}) => ({
  policy_id: id,
  title,
  category_id: `CAT:${cat}`,
  application_end_date: endOffset == null ? null : at(endOffset),
  is_always_open: endOffset == null,
  recruitment_status: endOffset == null ? '상시' : endOffset < 0 ? '마감' : '모집 중',
  d_day: endOffset,
  region_names: ['부산광역시'],
  docs_total: 4,
  docs_checked: 2,
  bookmarked: true,
  bookmark_id: `b-${id}`,
  stage: null,
  applied_at: null,
  expected_result_date: null,
  alarms: [],
  ...extra,
});

const h = (days, hh, mm) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hh - 9, mm, 0, 0);
  return d.toISOString();
};

export const SAMPLE_CALENDAR = {
  today,
  items: [
    item('s1', '청년 면접정장 무료 대여', '취업·진로', 3, {
      stage: 'PREPARING',
      region_names: ['부산광역시'],
      alarms: [
        {
          alarm_id: 'a1',
          kind: 'PRESET',
          preset_code: 'D3',
          fire_at: h(0, 9, 0),
          repeat_daily: false,
        },
        {
          alarm_id: 'a2',
          kind: 'PRESET',
          preset_code: 'D1',
          fire_at: h(2, 9, 0),
          repeat_daily: false,
        },
        {
          alarm_id: 'a3',
          kind: 'PRESET',
          preset_code: 'DDAY_AM',
          fire_at: h(3, 9, 0),
          repeat_daily: false,
        },
      ],
    }),
    item('s2', '청년 월세 지원', '주거·생활', 4, {
      alarms: [
        {
          alarm_id: 'a4',
          kind: 'PRESET',
          preset_code: 'D1',
          fire_at: h(3, 9, 0),
          repeat_daily: false,
        },
        {
          alarm_id: 'a5',
          kind: 'PRESET',
          preset_code: 'M30',
          fire_at: h(4, 23, 29),
          repeat_daily: false,
        },
      ],
      docs_checked: 1,
    }),
    item('s3', '부산 청년 문화패스', '문화', 11, { docs_total: 0, docs_checked: 0 }),
    item('s4', '희망디딤돌 장학금', '장학·금융', 20, { region_names: ['사하구'], docs_checked: 4 }),
    item('s5', '청년 교통비 지원', '주거·생활', null, { stage: null }),
    item('s6', '2026년 청년월세 지원', '주거·생활', -12, { stage: null }),
    item('s7', '청년 일경험 참여자 모집', '취업·진로', 6, {
      bookmarked: false,
      bookmark_id: null,
      stage: 'APPLIED',
      applied_at: at(-1),
      expected_result_date: at(9),
    }),
  ],
  events: [
    { type: 'DEADLINE', date: at(3), policy_id: 's1' },
    { type: 'DEADLINE', date: at(4), policy_id: 's2' },
    { type: 'DEADLINE', date: at(11), policy_id: 's3' },
    { type: 'DEADLINE', date: at(20), policy_id: 's4' },
    { type: 'DEADLINE', date: at(-12), policy_id: 's6' },
    { type: 'DEADLINE', date: at(6), policy_id: 's7' },
    { type: 'APPLIED', date: at(-1), policy_id: 's7' },
    { type: 'RESULT', date: at(9), policy_id: 's7' },
  ],
};

export const SAMPLE_ALARM_INFO = {
  policy: {
    policy_id: 's2',
    title: '청년 월세 지원',
    application_end_date: at(4),
    deadline_at: h(4, 23, 59),
    docs_total: 4,
  },
  now: new Date().toISOString(),
  day_alarm_time: '09:00',
  default_presets: ['D1', 'M30'],
  alarms: SAMPLE_CALENDAR.items[1].alarms,
  presets: [
    ['W1', '1주 전', -3, 9, 0],
    ['D3', '3일 전', 1, 9, 0],
    ['D1', '1일 전', 3, 9, 0],
    ['DDAY_AM', '당일 오전 9시', 4, 9, 0],
    ['H3', '3시간 전', 4, 20, 59],
    ['H1', '1시간 전', 4, 22, 59],
    ['M30', '30분 전', 4, 23, 29],
    ['M10', '10분 전', 4, 23, 49],
  ].map(([code, label, d, hh, mm]) => ({
    code,
    label,
    fire_at: h(d, hh, mm),
    past: d < 0,
    is_default: code === 'D1' || code === 'M30',
  })),
};
