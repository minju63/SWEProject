import { api } from './client';

// 알림 센터: 최근 30일 알림 목록 (최신순)
export const fetchNotifications = () => api.get('/me/notifications');
// 읽지 않은 알림 수: { unread: number }
export const fetchUnreadCount = () => api.get('/me/notifications/unread-count');
export const markNotificationRead = (id) => api.patch(`/me/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.post('/me/notifications/read-all');
