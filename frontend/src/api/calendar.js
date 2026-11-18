import { api } from './client';

export const fetchCalendar = () => api.get('/me/calendar');
export const fetchAlarmInfo = (policyId) => api.get(`/me/policies/${policyId}/alarms`);
// body: { presets: ['D1','M30'], customs: [{ fire_at: ISO, repeat_daily: false }] }
export const saveAlarmInfo = (policyId, body) => api.put(`/me/policies/${policyId}/alarms`, body);
export const deleteAlarm = (alarmId) => api.delete(`/me/alarms/${alarmId}`);
