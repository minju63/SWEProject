import { api } from './client';

export const fetchCalendar = () => api.get('/me/calendar');
export const fetchAlarmInfo = (policyId) => api.get(`/me/policies/${policyId}/alarms`);
// body: { presets: ['D1','M30'], customs: [{ fire_at: ISO, repeat_daily: false }] }
export const saveAlarmInfo = (policyId, body) => api.put(`/me/policies/${policyId}/alarms`, body);
// 준비물 체크: docKey 는 캘린더가 내려준 documents[].key 를 그대로 쓴다 (마이·정책 상세와 같은 저장소)
export const setDocumentChecked = (policyId, docKey, isChecked) =>
  api.put(`/me/documents/${policyId}`, { docKey, isChecked });
export const deleteAlarm = (alarmId) => api.delete(`/me/alarms/${alarmId}`);
