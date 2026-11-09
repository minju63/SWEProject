import NotificationBell from './NotificationBell.jsx';

// 탭 화면 공통 헤더: 왼쪽 제목(+부제), 오른쪽 알림 아이콘
// 홈은 brand 를 켜서 파란 "청해" 로고로 표시
export default function PageHeader({ title, subtitle, brand = false, right }) {
  return (
    <header className="page-header">
      <div>
        <h1 className={brand ? 'brand' : undefined}>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className="page-header-right">
        {right}
        <NotificationBell />
      </div>
    </header>
  );
}
