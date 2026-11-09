import { BellIcon } from './icons.jsx';

// 모든 탭 상단에 고정되는 알림 아이콘
// TODO(은혜): 안 읽은 알림 수 API 연결, 누르면 알림 센터 바텀시트 열기
export default function NotificationBell({ unreadCount = 0, onClick }) {
  return (
    <button type="button" className="bell" aria-label={`알림 ${unreadCount}개`} onClick={onClick}>
      <BellIcon />
      {unreadCount > 0 && (
        <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  );
}
