import { BellIcon } from './icons.jsx';
import { useNotifications } from '../lib/notifications';
import { useNavigate } from 'react-router';

// 모든 탭 상단에 고정되는 알림 아이콘
export default function NotificationBell({ unreadCount, onClick }) {
  const notifications = useNotifications(),
    navigate = useNavigate();
  const count = unreadCount ?? notifications.unreadCount;
  return (
    <button
      type="button"
      className="bell"
      aria-label={`알림 ${count}개`}
      onClick={onClick || (() => navigate('/notifications'))}
    >
      <BellIcon />
      {count > 0 && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
