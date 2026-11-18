// 캘린더 날짜·시각 계산. 서비스는 한국 시간(KST)만 쓰므로, 브라우저 시간대와 상관없이 KST 로 맞춘다.
const KST_MS = 9 * 60 * 60 * 1000;
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');

// Date → KST 년·월·일·시·분
export function kstParts(date) {
  const d = new Date(new Date(date).getTime() + KST_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

// KST 년·월·일·시·분 → Date
export const kstToDate = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h - 9, min));

export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parseKey = (key) => {
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  return { y, m, d };
};
export const addDaysKey = (key, n) => {
  const { y, m, d } = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return dateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
export const diffDays = (a, b) => {
  const pa = parseKey(a);
  const pb = parseKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
};
export const weekdayOf = (key) => {
  const { y, m, d } = parseKey(key);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// "10.09 (금)"
export const shortDate = (key) => {
  const { m, d } = parseKey(key);
  return `${pad(m)}.${pad(d)} (${weekdayOf(key)})`;
};

// 달력 칸: 그 달을 덮는 주 단위 (앞뒤 달 날짜는 inMonth=false)
export function monthCells(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = Math.ceil((lead + days) / 7);
  const cells = [];
  for (let i = 0; i < rows * 7; i += 1) {
    const t = new Date(Date.UTC(year, month - 1, 1 - lead + i));
    cells.push({
      key: dateKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()),
      day: t.getUTCDate(),
      inMonth: t.getUTCMonth() === month - 1,
      dow: i % 7,
    });
  }
  return cells;
}

// 시각 라벨: "오전 9:00" / "오후 5:30"
export function clockLabel(date) {
  const { h, min } = kstParts(date);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(min)}`;
}

// 알림 라벨: 프리셋은 이름, 직접 정한 시각은 "10.06 오후 9:30"
const PRESET_LABEL = {
  W1: '1주 전',
  D3: '3일 전',
  D1: '1일 전',
  H3: '3시간 전',
  H1: '1시간 전',
  M30: '30분 전',
  M10: '10분 전',
};
export function alarmLabel(alarm, dayHour = 9) {
  if (alarm.kind === 'PRESET') {
    if (alarm.preset_code === 'DDAY_AM') return `당일 오전 ${dayHour}시`;
    return PRESET_LABEL[alarm.preset_code] ?? '알림';
  }
  const p = kstParts(alarm.fire_at);
  return `${alarm.repeat_daily ? '매일 ' : `${pad(p.m)}.${pad(p.d)} `}${clockLabel(alarm.fire_at)}`;
}

// 알림 시각 표시: "10.08 (목) 오전 9:00"
export function alarmWhen(iso) {
  const p = kstParts(iso);
  return `${shortDate(dateKey(p.y, p.m, p.d))} ${clockLabel(iso)}`;
}

// 마감까지 남은 시간: "2일 20시간 30분 전"
export function remainingText(fireAt, deadlineAt) {
  const total = Math.max(0, Math.round((new Date(deadlineAt) - new Date(fireAt)) / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts = [];
  if (d) parts.push(`${d}일`);
  if (h) parts.push(`${h}시간`);
  if (m || parts.length === 0) parts.push(`${m}분`);
  return `${parts.join(' ')} 전`;
}
