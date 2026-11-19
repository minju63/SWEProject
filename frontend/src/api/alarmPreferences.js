import { api } from './client';

// 마이 › 알림 설정 저장 (FR-MY-009, FR-MY-012~016). 로그인 필요.
//   all_enabled(전체 알림) · recommend_enabled(맞춤 알림) · new_match_enabled(정책 알림)
//   event_enabled(문화행사 알림) · facility_enabled(주변 시설 알림) · deadline_enabled(마감 임박 알림)
export const fetchAlarmPreferences = () => api.get('/me/alarm-preferences');
// 바꾼 항목만 보내면 된다. 예: saveAlarmPreferences({ deadline_enabled: false })
export const saveAlarmPreferences = (changes) => api.put('/me/alarm-preferences', changes);
