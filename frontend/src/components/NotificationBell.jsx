import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchUnreadCount } from '../api/notifications';
import { useAuthStore } from '../store/authStore';
import { BellIcon } from './icons.jsx';

// 모든 탭 상단에 쓰는 알림 종 (배경 없이 종만). 안 읽은 알림이 있을 때만 오른쪽 위에 파란 점이 뜬다
export default function NotificationBell({ unreadCount, onClick }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const unread = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: fetchUnreadCount,
    enabled: Boolean(user) && unreadCount === undefined,
    refetchInterval: 60_000,
  });
  const count = unreadCount ?? unread.data?.unread ?? 0;
  return (
    <button
      type="button"
      className="bell"
      aria-label={count > 0 ? `알림 ${count}개` : '알림'}
      onClick={onClick ?? (() => navigate('/notifications'))}
    >
      <BellIcon />
      {count > 0 && <span className="bell-dot" aria-hidden="true" />}
    </button>
  );
}
