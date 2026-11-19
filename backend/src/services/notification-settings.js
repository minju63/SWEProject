import { AppError } from '../utils/response.js';
export const defaultNotificationSettings = {
  enabled: true,
  recommendations: true,
  policyAlerts: true,
  eventAlerts: true,
  facilityAlerts: true,
  deadlines: true,
  applicationUpdates: true,
  deadlineTiming: '3일 전',
  quietHours: false,
};
export function notificationSettings(input = {}) {
  const out = { ...defaultNotificationSettings };
  for (const key of Object.keys(out))
    if (Object.hasOwn(input, key)) {
      if (key === 'deadlineTiming') {
        if (!['당일', '1일 전', '3일 전', '7일 전'].includes(input[key]))
          throw new AppError(400, 'INVALID_NOTIFICATION_SETTINGS', '알림 시간을 확인해주세요.');
      } else if (typeof input[key] !== 'boolean')
        throw new AppError(400, 'INVALID_NOTIFICATION_SETTINGS', '알림 설정값을 확인해주세요.');
      out[key] = input[key];
    }
  return out;
}
export const notificationGroup = (type) =>
  ({
    DEADLINE: '마감',
    NEW_MATCH: '맞춤 혜택',
    MATCH: '맞춤 혜택',
    POLICY: '정책',
    NEW_POLICY: '정책',
    CULTURE: '문화행사',
    EVENT: '문화행사',
    FACILITY: '주변 시설',
    APPLICATION: '신청',
    RESULT: '신청',
  })[type] || '기타';
