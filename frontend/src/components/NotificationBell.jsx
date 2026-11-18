import { useNavigate } from 'react-router-dom';
import { BellIcon } from './icons.jsx';

// 모든 탭 상단에 고정되는 알림 아이콘 (마이 탭과 같은 종 모양, 배경 없이 종 + 파란 점)
// TODO(은혜): 안 읽은 알림 수 API 연결, 누르면 알림 센터 바텀시트 열기
export default function NotificationBell({ unreadCount = 0, onClick }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="bell"
      aria-label={`알림 ${unreadCount}개`}
      onClick={onClick ?? (() => navigate('/notifications'))}
    >
      <BellIcon />
      <span className="bell-dot" aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  );
}
