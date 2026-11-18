// 하단 탭·헤더 아이콘 (stroke 기반, currentColor 사용)
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const HomeIcon = () => (
  <svg {...base}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
  </svg>
);

export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const MapIcon = () => (
  <svg {...base}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const CalendarIcon = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const UserIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

export const BellIcon = () => (
  <svg {...base}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
  </svg>
);

export const BackIcon = () => (
  <svg {...base}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const BriefcaseIcon = () => (
  <svg {...base}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
  </svg>
);

export const CoinIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 9h8M8 12h8M10 9l1.5 7M14 9l-1.5 7" />
  </svg>
);

export const ArtIcon = () => (
  <svg {...base}>
    <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.6-2-.5-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3Z" />
    <path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01" />
  </svg>
);

export const HealthIcon = () => (
  <svg {...base}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    <path d="M12 9v5M9.5 11.5h5" />
  </svg>
);

// 찜 하트: 채움(filled)이면 색이 가득 찬 하트, 아니면 테두리만. 색은 글자색(currentColor)을 따른다
export const HeartIcon = ({ filled = true, size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.2 0 5.4 3.1 4.3 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z" />
  </svg>
);

// 알림 종(작은 크기·채움): 이모지와 달리 한 가지 색으로만 그려진다
export const BellFillIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
    <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5v4.1L3.7 16.3a1 1 0 0 0 .9 1.5h14.8a1 1 0 0 0 .9-1.5l-1.8-3.2V9A6.5 6.5 0 0 0 12 2.5Z" />
    <path d="M9.6 19.2h4.8a2.4 2.4 0 0 1-4.8 0Z" />
  </svg>
);

export const ClockIcon = ({ size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
