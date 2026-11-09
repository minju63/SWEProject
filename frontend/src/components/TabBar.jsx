import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/search', label: '검색', icon: '🔍' },
  { to: '/map', label: '지도', icon: '🗺️' },
  { to: '/calendar', label: '캘린더', icon: '📅' },
  { to: '/my', label: '마이', icon: '👤' },
];

export default function TabBar() {
  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          <span aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
