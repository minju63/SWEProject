import { CATEGORY_STYLE } from './homeConfig.js';

const P = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};
export default function CategoryIcon({ name, size = 24 }) {
  const icon = CATEGORY_STYLE[name]?.icon;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...P}>
      {icon === 'home' && (
        <>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
        </>
      )}
      {icon === 'job' && (
        <>
          <rect x="3" y="8" width="18" height="12" rx="2" />
          <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
        </>
      )}
      {icon === 'coin' && (
        <>
          <ellipse cx="12" cy="7" rx="7" ry="3" />
          <path d="M5 7v5c0 1.7 3 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3 3 7 3s7-1.3 7-3v-5" />
        </>
      )}
      {icon === 'music' && (
        <>
          <path d="M9 18V6l10-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </>
      )}
      {icon === 'building' && (
        <>
          <rect x="5" y="3" width="14" height="18" rx="1.5" />
          <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" />
        </>
      )}
    </svg>
  );
}
