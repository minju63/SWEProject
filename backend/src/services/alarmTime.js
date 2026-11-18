// 정책 알림 시각 계산·검증 (SRS FR-C06~C13). 모두 한국 시간(KST, +09:00) 기준이다.
//
// 마감 시각: 정책에 마감 시각이 따로 없으므로 마감일 23:59 로 본다 (docs/srs-change-notes.md).
// 날짜 단위 알림(1주 전·3일 전·1일 전·당일 오전)은 그날 "알림 시각"(기본 09:00)에 보낸다.
// 시간 단위 알림(3시간·1시간·30분·10분 전)은 마감 시각에서 그만큼 뺀 시각에 보낸다.
import { AppError } from '../utils/response.js';

const KST = '+09:00';
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DAY_TIME = '09:00';
export const MAX_CUSTOM_ALARMS = 10;

export const PRESETS = [
  { code: 'W1', label: '1주 전', days: 7 },
  { code: 'D3', label: '3일 전', days: 3 },
  { code: 'D1', label: '1일 전', days: 1 },
  { code: 'DDAY_AM', label: '당일 오전', days: 0 },
  { code: 'H3', label: '3시간 전', minutes: 180 },
  { code: 'H1', label: '1시간 전', minutes: 60 },
  { code: 'M30', label: '30분 전', minutes: 30 },
  { code: 'M10', label: '10분 전', minutes: 10 },
];
export const PRESET_CODES = PRESETS.map((p) => p.code);
export const presetOf = (code) => PRESETS.find((p) => p.code === code);

// 마감 시각 (마감일 23:59). 마감일이 없거나 상시 모집이면 null
export function deadlineAt(endDate) {
  return endDate ? new Date(`${endDate}T23:59:00${KST}`) : null;
}

// 프리셋 알림 시각
export function presetFireAt(code, endDate, dayTime = DEFAULT_DAY_TIME) {
  const preset = presetOf(code);
  const deadline = deadlineAt(endDate);
  if (!preset || !deadline) return null;
  if (preset.minutes != null) return new Date(deadline.getTime() - preset.minutes * 60 * 1000);
  const time = String(dayTime).slice(0, 5);
  return new Date(new Date(`${endDate}T${time}:00${KST}`).getTime() - preset.days * DAY_MS);
}

// 직접 정한 시각 검증: 지금 이후이고 마감 이전이어야 한다 (FR-C10, FR-C13)
export function assertValidFireAt(fireAt, endDate, now = new Date()) {
  const deadline = deadlineAt(endDate);
  if (!deadline)
    throw new AppError(400, 'NO_DEADLINE', '마감일이 없는 정책은 알림을 만들 수 없어요.');
  if (Number.isNaN(fireAt.getTime()))
    throw new AppError(400, 'INVALID_TIME', '알림 시각이 올바르지 않아요.');
  if (fireAt.getTime() <= now.getTime())
    throw new AppError(400, 'ALARM_TIME_PAST', '지난 시각에는 알림을 만들 수 없어요.');
  if (fireAt.getTime() > deadline.getTime())
    throw new AppError(400, 'ALARM_AFTER_DEADLINE', '마감 이후 시각에는 알림을 만들 수 없어요.');
}

// 오늘(KST) 날짜 문자열 YYYY-MM-DD
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
