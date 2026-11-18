import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchUnreadCount } from '../api/notifications';
import { useAuthStore } from '../store/authStore';
import { BellIcon } from './icons.jsx';

export const UNREAD_KEY = ['notifications', 'unread'];

// 읽지 않은 알림 수 (로그인했을 때만). 30초마다, 그리고 화면에 돌아올 때(탭 전환·창 포커스) 바로 다시 가져온다 (FR-MY-008)
export function useUnreadCount() {
  const user = useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  return user ? (q.data?.unread ?? 0) : 0;
}

// 모든 탭 상단에 쓰는 알림 종 (배경 없이 종만). 읽지 않은 알림 수를 오른쪽 위에 보여 주고 100건 이상은 99+ 로 줄인다.
// 누르면 알림 센터(/notifications)를 연다.
export default function NotificationBell({ onClick }) {
  const navigate = useNavigate();
  const count = useUnreadCount();
  return (
    <button
      type="button"
      className="bell"
      aria-label={count > 0 ? `알림 ${count > 99 ? '99개 이상' : `${count}개`}` : '알림'}
      onClick={onClick ?? (() => navigate('/notifications'))}
    >
      <BellIcon />
      {count > 0 && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
