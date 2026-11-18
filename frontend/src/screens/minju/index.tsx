// src/screens/minju/index.tsx  (민주 공용 UI)
// lucide-react 대신 ./icons 사용
import { useState, type ReactNode } from "react";
import {
  Bell,
  Search,
  Camera,
  Home,
  MapIcon as Map,
  CalendarDays,
  User,
  Heart,
  Check,
  AlertCircle,
  X,
  Briefcase,
  Coins,
  Music,
  Building2,
  ChevronRight,
  Info,
  Sparkles,
} from "./icons";

const HomeIcon = Home;

export const C = {
  main: "#2F7BF5",
  mainSoft: "#EAF2FE",
  text: "#18202F",
  sub: "#5F6B80",
  faint: "#9AA4B5",
};

export const CATEGORIES = [
  { key: "home", label: "주거·생활", color: "#4F9DF7", icon: HomeIcon },
  { key: "job", label: "취업·진로", color: "#F98DA5", icon: Briefcase },
  { key: "money", label: "장학·금융", color: "#F9CF6E", icon: Coins },
  { key: "culture", label: "문화", color: "#76D8BC", icon: Music },
  { key: "space", label: "공간·시설", color: "#BFA4F4", icon: Building2 },
] as const;

const shadow = "shadow-[0_6px_20px_rgba(47,123,245,0.08)]";

/* ---------- Busan skyline ---------- */
function BusanSkyline() {
  return (
    <svg
      viewBox="0 0 220 110"
      className="pointer-events-none absolute right-0 top-6 z-0 h-[110px] w-[220px]"
      aria-hidden
    >
      <g fill="#D6E6FD">
        <path d="M0 110 Q40 60 90 80 T180 70 T220 85 V110Z" opacity=".7" />
        <rect x="150" y="40" width="12" height="60" rx="2" />
        <rect x="166" y="54" width="14" height="46" rx="2" />
        <rect x="184" y="30" width="10" height="70" rx="2" />
        <rect x="198" y="48" width="14" height="52" rx="2" />
      </g>
      {/* Busan tower */}
      <g fill="#C3DAFC">
        <rect x="121" y="28" width="5" height="62" />
        <ellipse cx="123.5" cy="34" rx="8" ry="4" />
        <rect x="122.5" y="14" width="2" height="16" />
      </g>
      {/* Gwangan bridge */}
      <g stroke="#B5D0FB" strokeWidth="2" fill="none">
        <path d="M0 92 H120" />
        <path d="M25 92 V55 M75 92 V55" />
        <path d="M0 80 Q25 55 25 55 Q50 85 75 55 Q100 80 120 82" />
        {[35, 45, 55, 65, 85, 95].map((x) => (
          <path key={x} d={`M${x} 92 V${x < 75 ? 70 : 68}`} strokeWidth="1" />
        ))}
      </g>
    </svg>
  );
}

/* ---------- AppHeader ---------- */
export function AppHeader({
  unread = 2,
  hannuniHidden = false,
  onRestore,
  onBell,
}: {
  unread?: number;
  hannuniHidden?: boolean;
  onRestore?: () => void;
  onBell?: () => void;
}) {
  return (
    <header className="relative flex items-start justify-between gap-3 px-[18px] pb-4 pt-3">
      <BusanSkyline />
      <div className="relative flex flex-col gap-1">
        <h1
          className="text-[27px] font-extrabold leading-tight tracking-[-0.02em]"
          style={{ color: C.text }}
        >
          부산청년 <span style={{ color: C.main }}>한눈에</span>
        </h1>
        <p className="text-[12.5px] font-medium" style={{ color: C.sub }}>
          부산 청년 AI 생활·혜택 안내 서비스
        </p>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        {hannuniHidden && (
          <div className="relative">
            <button
              aria-label="한눈이 다시 보기"
              onClick={onRestore}
              className={`flex size-11 items-center justify-center rounded-full border-[2.5px] border-[#2F7BF5] bg-white ${shadow}`}
            >
              <Hannuni size={32} />
            </button>
            <div className="absolute right-[-52px] top-[54px] z-20 w-max rounded-[12px] bg-[#18202F] px-3 py-2 text-[12px] font-semibold text-white shadow-lg">
              <span className="absolute right-[68px] -top-1 size-2.5 rotate-45 bg-[#18202F]" />
              위 얼굴 버튼을 누르면 한눈이가 다시 나와요
            </div>
          </div>
        )}
        <button
          aria-label="알림"
          onClick={onBell}
          className={`relative flex size-11 shrink-0 items-center justify-center rounded-full bg-white ${shadow}`}
        >
          <Bell size={20} color={C.text} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-[18px] items-center justify-center rounded-full bg-[#EF4E6C] text-[10.5px] font-bold text-white ring-2 ring-white">
              {unread}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

/* ---------- SearchBar ---------- */
export function SearchBar({
  active = false,
  onFocus,
}: {
  active?: boolean;
  onFocus?: () => void;
}) {
  return (
    <label
      onClick={onFocus}
      className={`flex h-[54px] items-center gap-2.5 rounded-[18px] bg-white pl-2 pr-2 ${
        active
          ? "border-2 border-[#2F7BF5] shadow-[0_0_0_4px_rgba(47,123,245,0.18)]"
          : `border border-[#D5E5FD] ${shadow}`
      }`}
    >
      <span
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full"
        style={{ background: C.mainSoft }}
      >
        <Search size={18} color={C.main} strokeWidth={2.4} />
      </span>
      <input
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9AA4B5]"
        placeholder="정책명·키워드 검색 (예: 월세, 면접정장)"
      />
      <button
        aria-label="카메라 검색"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full hover:bg-[#F2F6FC]"
      >
        <Camera size={19} color={C.sub} />
      </button>
    </label>
  );
}

/* ---------- Badges ---------- */
export type Status = "ok" | "check" | "no";
const STATUS = {
  ok: { label: "신청 가능", fg: "#1E9E6A", bg: "#E3F6EE", Icon: Check },
  check: {
    label: "확인 필요",
    fg: "#C98A0C",
    bg: "#FFF4D9",
    Icon: AlertCircle,
  },
  no: { label: "대상 아님", fg: "#EF4E6C", bg: "#FDE9ED", Icon: X },
};
export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-bold"
      style={{ color: s.fg, background: s.bg }}
    >
      <s.Icon size={12} strokeWidth={3} />
      {s.label}
    </span>
  );
}
export function RegionBadge({ region }: { region: string }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-full bg-[#F1F3F7] px-2 text-[11.5px] font-semibold"
      style={{ color: C.sub }}
    >
      {region}
    </span>
  );
}
export function DDay({ days }: { days: number | null }) {
  const always = days === null;
  const urgent = !always && days! <= 7;
  const style = always
    ? { color: C.faint, background: "#F1F3F7" }
    : urgent
      ? { color: "#EF4E6C", background: "#FDE9ED" }
      : { color: C.main, background: C.mainSoft };
  return (
    <span
      className="inline-flex h-6 items-center rounded-full px-2 text-[11.5px] font-extrabold tabular-nums"
      style={style}
    >
      {always ? "상시" : `D-${days}`}
    </span>
  );
}

/* ---------- BenefitCard ---------- */
export type Benefit = {
  id: string;
  status: Status;
  region: string;
  days: number | null;
  title: string;
  desc: string;
  liked?: boolean;
};
export function BenefitCard({
  b,
  onSave,
  onOpen,
  deadlineLabel,
}: {
  b: Benefit;
  onSave?: () => void;
  onOpen?: () => void;
  deadlineLabel?: string;
}) {
  const [liked, setLiked] = useState(!!b.liked);
  return (
    <article
      className={`flex flex-col gap-2.5 rounded-[22px] bg-white p-4 ${shadow}`}
    >
      <div className="flex items-center gap-1.5">
        <StatusBadge status={b.status} />
        <RegionBadge region={b.region} />
        <div className="flex-1" />
        {deadlineLabel ? (
          <span className="text-[11px] font-bold text-[#5F6B80]">
            {deadlineLabel}
          </span>
        ) : (
          <DDay days={b.days} />
        )}
        <button
          aria-label="찜"
          aria-pressed={onSave ? !!b.liked : liked}
          onClick={() => (onSave ? onSave() : setLiked(!liked))}
          className="flex size-8 items-center justify-center rounded-full transition-colors"
          style={{
            background: (onSave ? b.liked : liked) ? "#FDE9ED" : "transparent",
          }}
        >
          <Heart
            size={17}
            color={(onSave ? b.liked : liked) ? "#EF4E6C" : "#B8C0CD"}
            fill={(onSave ? b.liked : liked) ? "#EF4E6C" : "none"}
            strokeWidth={2.2}
          />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <h3
          className="text-[15.5px] font-bold leading-snug"
          style={{ color: C.text }}
        >
          {onOpen ? (
            <button onClick={onOpen} className="text-left">
              {b.title}
            </button>
          ) : (
            b.title
          )}
        </h3>
        <p className="truncate text-[12.5px]" style={{ color: C.sub }}>
          {b.desc}
        </p>
      </div>
    </article>
  );
}

/* ---------- CategoryRow ---------- */
export function CategoryRow({
  counts = [17, 12, 9, 6, 5],
  selected = null,
  onSelect,
  showCounts = true,
  bare = false,
}: {
  counts?: number[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  showCounts?: boolean;
  bare?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        bare ? "" : `rounded-[22px] bg-white px-3 py-4 ${shadow}`
      }`}
    >
      {CATEGORIES.map(({ key, label, color, icon: Icon }, i) => (
        <button
          key={key}
          onClick={() => onSelect?.(i)}
          className={`flex w-[60px] flex-col items-center gap-2 transition-opacity ${
            selected !== null && selected !== i ? "opacity-40" : ""
          }`}
        >
          <span
            className={`relative flex size-[54px] items-center justify-center rounded-[17px] ${
              selected === i ? "ring-2 ring-[#2F7BF5] ring-offset-2" : ""
            }`}
            style={{ background: `${color}29` }}
          >
            <Icon size={24} color={color} strokeWidth={2.3} />
            {showCounts && (
              <span
                className="absolute -right-1.5 -top-1.5 flex size-[21px] items-center justify-center rounded-full bg-white text-[10.5px] font-extrabold shadow-[0_2px_6px_rgba(47,123,245,0.18)]"
                style={{ color }}
              >
                {counts[i]}
              </span>
            )}
          </span>
          <span
            className="text-[11.5px] font-semibold"
            style={{ color: C.text }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SegmentToggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-full bg-[#E1EAF8] p-[3px]">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`h-7 rounded-full px-3 text-[12px] font-bold transition-colors ${
            o === value
              ? "bg-white text-[#2F7BF5] shadow-[0_2px_6px_rgba(47,123,245,0.15)]"
              : "text-[#9AA4B5]"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/* ---------- CategoryDonut ---------- */
export function CategoryDonut({
  values = [35, 24, 18, 12, 10],
  total = 49,
  counts = [17, 12, 9, 6, 5],
  selected = null,
  onSelect,
}: {
  values?: number[];
  total?: number;
  counts?: number[];
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const r = 56,
    sw = 34,
    circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative size-[150px] shrink-0">
      <svg viewBox="0 0 150 150" className="size-full overflow-visible">
        <g transform="rotate(-90 75 75)">
          {values.map((v, i) => {
            const len = (v / sum) * circ;
            const midA = ((acc + len / 2) / circ) * 2 * Math.PI;
            const on = selected === i,
              dim = selected !== null && !on;
            const el = (
              <circle
                key={i}
                onClick={() => onSelect?.(on ? null : i)}
                className="cursor-pointer transition-all"
                opacity={dim ? 0.3 : 1}
                transform={
                  on
                    ? `translate(${6 * Math.cos(midA)} ${6 * Math.sin(midA)})`
                    : undefined
                }
                cx="75"
                cy="75"
                r={r}
                fill="none"
                stroke={CATEGORIES[i].color}
                strokeWidth={sw}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        {(() => {
          let a0 = 0;
          return values.map((v, i) => {
            const mid = ((a0 + v / 2) / sum) * 2 * Math.PI - Math.PI / 2;
            a0 += v;
            const on = selected === i;
            const off = on ? 6 : 0;
            return (
              <text
                key={i}
                pointerEvents="none"
                opacity={selected !== null && !on ? 0.5 : 1}
                x={75 + (r + off) * Math.cos(mid)}
                y={75 + (r + off) * Math.sin(mid)}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#fff"
                fontSize="10.5"
                fontWeight="800"
              >
                {v}%
              </text>
            );
          });
        })()}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[24px] font-extrabold leading-none"
          style={{ color: selected !== null ? C.main : C.text }}
        >
          {selected !== null ? counts[selected] : total}개
        </span>
        <span
          className="mt-1 text-[10.5px] font-semibold"
          style={{ color: selected !== null ? C.main : C.sub }}
        >
          {selected !== null ? CATEGORIES[selected].label : "맞춤 혜택"}
        </span>
      </div>
    </div>
  );
}

export function GuideBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5 rounded-[16px] border-[1.5px] border-dashed border-[#B9D2FB] bg-white/60 px-4 py-3 text-[12.5px] font-medium"
      style={{ color: C.sub }}
    >
      <Info size={15} color={C.main} />
      {children}
    </div>
  );
}

/* ---------- DeadlineCard ---------- */
export type Deadline = {
  id: string;
  days: number;
  title: string;
  meta: string;
  done: number;
  total: number;
  liked?: boolean;
};
export function DeadlineCard({
  d,
  onOpen,
  onUnlike,
}: {
  d: Deadline;
  onOpen?: () => void;
  onUnlike?: () => void;
}) {
  const liked = d.liked !== false;
  const pct = d.total ? Math.min(100, (d.done / d.total) * 100) : 0;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className={`flex w-[236px] shrink-0 cursor-pointer snap-start flex-col gap-3 rounded-[22px] bg-white p-4 ${shadow}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-extrabold ${
            d.days <= 7
              ? "bg-[#EF4E6C] text-white"
              : "bg-[#EAF2FE] text-[#2F7BF5]"
          }`}
        >
          D-{d.days}
        </span>
        <button
          aria-label="찜"
          onClick={(e) => {
            e.stopPropagation();
            onUnlike?.();
          }}
          className="relative flex size-8 cursor-pointer after:absolute after:-inset-1.5 after:content-[''] items-center justify-center rounded-full"
          style={{ background: liked ? "#FDE9ED" : "transparent" }}
        >
          <Heart
            size={16}
            color={liked ? "#EF4E6C" : "#B8C0CD"}
            fill={liked ? "#EF4E6C" : "none"}
            strokeWidth={2.2}
          />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[15.5px] font-bold" style={{ color: C.text }}>
          {d.title}
        </h3>
        <p className="text-[12px] tabular-nums" style={{ color: C.sub }}>
          {d.meta}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EDF1F7]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: d.days <= 7 ? "#EF4E6C" : C.main,
            }}
          />
        </div>
        <span className="text-[11px] font-bold" style={{ color: C.sub }}>
          서류 {d.done}/{d.total}
        </span>
      </div>
    </article>
  );
}

export { Sparkles };

/* ---------- Hannuni ---------- */
export function Hannuni({ size = 52 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="hn-body" x1="0" y1="0" x2="0" y2="1">
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
      <rect x="9" y="13" width="46" height="44" rx="22" fill="url(#hn-body)" />
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
  );
}

export function HannuniFab({ onClose }: { onClose?: () => void }) {
  return (
    <div className="relative">
      <button
        aria-label="AI 한눈이에게 물어보기"
        className="flex size-[68px] items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(47,123,245,0.32)] transition-transform hover:scale-105 active:scale-95"
      >
        <Hannuni size={54} />
      </button>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="absolute -right-1 -top-1 flex size-[22px] items-center justify-center rounded-full bg-[#9AA4B5] ring-2 ring-white"
      >
        <X size={12} color="#fff" strokeWidth={3} />
      </button>
    </div>
  );
}

/* ---------- TabBar ---------- */
const TABS = [
  { key: "home", label: "홈", Icon: Home },
  { key: "search", label: "검색", Icon: Search },
  { key: "map", label: "지도", Icon: Map },
  { key: "cal", label: "캘린더", Icon: CalendarDays },
  { key: "my", label: "마이", Icon: User },
];
export function TabBar({
  active,
  onChange,
}: {
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <nav className="flex h-[64px] items-center justify-around px-2">
      {TABS.map(({ key, label, Icon }) => {
        const on = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="relative flex w-14 flex-col items-center gap-1"
          >
            <Icon
              size={24}
              color={on ? C.main : C.faint}
              strokeWidth={on ? 2.4 : 2}
            />
            <span
              className="text-[11.5px] font-semibold leading-none"
              style={{ color: on ? C.main : C.faint }}
            >
              {label}
            </span>
            <span
              className="absolute -bottom-[7px] size-1 rounded-full"
              style={{ background: on ? C.main : "transparent" }}
            />
          </button>
        );
      })}
    </nav>
  );
}

export function SectionTitle({
  children,
  more = true,
}: {
  children: ReactNode;
  more?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[17px] font-bold" style={{ color: C.text }}>
        {children}
      </h2>
      {more && (
        <button
          className="flex items-center text-[12.5px] font-medium"
          style={{ color: C.faint }}
        >
          전체보기
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
