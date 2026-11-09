import { NavLink } from 'react-router-dom';
import { HomeIcon, SearchIcon, MapIcon, CalendarIcon, UserIcon } from './icons.jsx';

const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon },
  { to: '/search', label: '검색', Icon: SearchIcon },
  { to: '/map', label: '지도', Icon: MapIcon },
  { to: '/calendar', label: '캘린더', Icon: CalendarIcon },
  { to: '/my', label: '마이', Icon: UserIcon },
];

export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="하단 메뉴">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
