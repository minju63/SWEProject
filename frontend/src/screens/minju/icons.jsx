// src/screens/minju/icons.tsx
// lucide-react 없이 쓰는 아이콘 + 한눈이 캐릭터 모음
// minju 폴더의 다른 파일에서:  import { Bell, Heart, Hannuni } from "./icons"
import { useId } from 'react'
function Svg({
  size = 20,
  color = 'currentColor',
  fill = 'none',
  strokeWidth = 2,
  className,
  children,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}
const make = (paths) => (p) => <Svg {...p}>{paths}</Svg>
/* ---------- 기본 아이콘 ---------- */
export const X = make(<path d="M18 6 6 18M6 6l12 12" />)
export const Plus = make(<path d="M5 12h14M12 5v14" />)
export const Minus = make(<path d="M5 12h14" />)
export const Check = make(<path d="M20 6 9 17l-5-5" />)
export const ArrowUp = make(<path d="m5 12 7-7 7 7M12 19V5" />)
export const ArrowLeft = make(<path d="m12 19-7-7 7-7M19 12H5" />)
export const ChevronLeft = make(<path d="m15 18-6-6 6-6" />)
export const ChevronRight = make(<path d="m9 18 6-6-6-6" />)
export const ChevronDown = make(<path d="m6 9 6 6 6-6" />)
export const ChevronUp = make(<path d="m18 15-6-6-6 6" />)
export const Heart = make(
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
)
export const Bell = make(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>
)
export const BellOff = make(
  <>
    <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
    <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" />
  </>
)
export const Settings = make(
  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
)
export const Clock = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>
)
export const CalendarIcon = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>
)
export const Search = make(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>
)
export const Sparkles = make(
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 3v4M17 5h4M5 17v4M3 19h4" />
)
export const ImagePlus = make(
  <>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
    <path d="M16 5h6M19 2v6" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </>
)
export const HelpCircle = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
  </>
)
export const AlertCircle = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </>
)
export const Info = make(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>
)
export const Eye = make(
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>
)
export const EyeOff = make(
  <>
    <path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" />
  </>
)
export const Trash2 = make(
  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
)
export const FileText = make(
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8" />
  </>
)
export const MapPin = make(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>
)
export const Camera = make(
  <>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </>
)
export const Home = make(
  <>
    <path d="m3 10 9-7 9 7" />
    <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
  </>
)
export const MapIcon = make(
  <>
    <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
    <path d="M9 3v15M15 6v15" />
  </>
)
export const CalendarDays = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </>
)
export const User = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>
)
export const Briefcase = make(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" />
  </>
)
export const Coins = make(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8" />
  </>
)
export const Music = make(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>
)
export const Building2 = make(
  <>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" />
  </>
)
/* ---------- 한눈이 캐릭터 (개인 사본 디자인) ---------- */
export function Hannuni({ size = 52, className }) {
  const gid = 'hn' + useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB0FF" />
          <stop offset="1" stopColor="#2F7BF5" />
        </linearGradient>
      </defs>
      <line
        x1="32"
        y1="14"
        x2="32"
        y2="7"
        stroke="#2F7BF5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M32 1.2l1.7 3.5 3.8.5-2.8 2.6.7 3.8L32 9.8l-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z"
        fill="#F9CF6E"
      />
      <rect x="4" y="27" width="8" height="16" rx="4" fill="#2F7BF5" />
      <rect x="52" y="27" width="8" height="16" rx="4" fill="#2F7BF5" />
      <rect x="9" y="13" width="46" height="44" rx="22" fill={`url(#${gid})`} />
      <rect x="15" y="21" width="34" height="28" rx="14" fill="#fff" />
      <circle cx="25" cy="33" r="3" fill="#18202F" />
      <circle cx="39" cy="33" r="3" fill="#18202F" />
      <circle cx="26" cy="32" r="1" fill="#fff" />
      <circle cx="40" cy="32" r="1" fill="#fff" />
      <ellipse cx="20.5" cy="39" rx="3" ry="2" fill="#F98DA5" opacity=".75" />
      <ellipse cx="43.5" cy="39" rx="3" ry="2" fill="#F98DA5" opacity=".75" />
      <path
        d="M28 39.5q4 3.5 8 0"
        stroke="#18202F"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
