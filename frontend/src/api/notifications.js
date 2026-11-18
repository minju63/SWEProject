import { api } from './client';

// 안 읽은 알림 개수: { unread: number }
export const fetchUnreadCount = () => api.get('/me/notifications/unread-count');
