// 지도 탭 아이콘 (Figma PlaceMap.tsx, MapScreen.tsx 의 SVG 그대로)

function pinGlyph(kind) {
  switch (kind) {
    case 'culture':
      return <path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5" />;
    case 'library':
      return (
        <path d="M4 5.5C7 4.5 10 5 12 7c2-2 5-2.5 8-1.5V19c-3-1-6-.5-8 1.5-2-2-5-2.5-8-1.5zM12 7v13" />
      );
    case 'sports':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16" />
        </>
      );
    case 'public_facility':
      return <path d="M5 20V8l7-4 7 4v12M9 20v-4h6v4M9 11h.01M15 11h.01" />;
    case 'youth_space':
      return (
        <>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.2" />
          <path d="M3.5 19c.5-3.5 2.7-5 5.5-5s5 1.5 5.5 5M15.5 14.5c2.5 0 4.3 1.2 5 4" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="4" />;
  }
}

export function CategoryPin({ kind, color, className, style }) {
  return (
    <svg viewBox="0 0 28 36" aria-hidden="true" className={className} style={style}>
      <path
        d="M14 35C14 35 2 21.5 2 13.5a12 12 0 0 1 24 0C26 21.5 14 35 14 35z"
        fill={color}
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="13.5" r="8" fill="#fff" />
      <g
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(14 13.5) scale(0.5) translate(-12 -12)"
      >
        {pinGlyph(kind)}
      </g>
    </svg>
  );
}

export function CategoryBadge({ kind, color, className }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <circle cx="14" cy="14" r="12.5" fill={color} stroke="#fff" strokeWidth="1.5" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(14 14) scale(0.68) translate(-12 -12)"
      >
        {pinGlyph(kind)}
      </g>
    </svg>
  );
}

const GLYPHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="7.5" />
    </>
  ),
  locateOff: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="m3 3 18 18" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  filter: (
    <>
      <path d="M4 6h3M13 6h7M4 12h9M19 12h1M4 18h1M11 18h9" />
      <circle cx="10" cy="6" r="2.2" />
      <circle cx="16" cy="12" r="2.2" />
      <circle cx="8" cy="18" r="2.2" />
    </>
  ),
};

export function Glyph({ name, className = 'size-5', strokeWidth = 1.9 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
}
