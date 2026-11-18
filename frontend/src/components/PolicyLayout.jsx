import { useLocation, useNavigate } from 'react-router'
import { Icon } from '../screens/HomeScreen'
export const accentTheme = '[--accent:#2F7BF5] [--accent-soft:#EAF2FE]'
export function AppShell({ children, className = '' }) {
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div
        className={`relative mx-auto min-h-screen max-w-[480px] overflow-hidden bg-[#f8f9fb] text-[#171923] shadow-[0_0_40px_rgba(23,25,35,0.08)] ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
export function BackButton({ onClick }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={onClick ?? (() => navigate(-1))}
      className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full"
      aria-label="뒤로 가기"
    >
      <svg
        className="size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  )
}
export function ScreenHeader({ title, action, onBack }) {
  return (
    <header className="sticky top-0 z-40 flex h-[68px] items-center gap-2 border-b border-black/[0.05] bg-white/95 px-5 backdrop-blur-xl">
      <BackButton onClick={onBack} />
      <h1 className="min-w-0 flex-1 text-[17px] font-black tracking-[-0.03em]">{title}</h1>
      {action}
    </header>
  )
}
export function PolicyTags({ category, region, target }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold">
      <span className="rounded-md bg-[color:var(--accent-soft,#f1f3fb)] px-2 py-1 text-[color:var(--accent,#2F7BF5)]">
        {category}
      </span>
      <span className="rounded-md bg-[#f3f4f6] px-2 py-1 text-black/45">{region}</span>
      {target && <span className="rounded-md bg-[#f3f4f6] px-2 py-1 text-black/45">{target}</span>}
    </div>
  )
}
export function BottomNav({ active = '검색' }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-[480px] -translate-x-1/2 grid-cols-5 border-t border-black/[0.07] bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
      aria-label="앱 메뉴"
    >
      {[
        { label: '홈', icon: 'home', path: '/' },
        { label: '검색', icon: 'search', path: '/search' },
        { label: '지도', icon: 'map', path: '/map' },
        { label: '캘린더', icon: 'calendar', path: '/calendar' },
        { label: '마이', icon: 'user', path: '/my' },
      ].map((item) => (
        <button
          key={item.label}
          onClick={() => {
            if (!item.path) return
            if (item.label === '검색' && !pathname.startsWith('/search')) {
              navigate(item.path + (sessionStorage.getItem('youthzip-last-search') ?? ''))
              return
            }
            navigate(item.path)
          }}
          className={`flex flex-col items-center gap-1 py-1 text-[10px] font-bold ${item.label === active ? 'text-[color:var(--accent,#2F7BF5)]' : 'text-black/30'}`}
        >
          <Icon name={item.icon} className="size-[21px]" />
          {item.label}
        </button>
      ))}
    </nav>
  )
}
export function SearchField({ value, onChange, onSubmit, placeholder, buttonLabel }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className={`flex h-13 items-center gap-3 rounded-2xl bg-[#f0f1f5] pl-4 ${buttonLabel ? 'pr-2' : 'pr-4'} focus-within:ring-2 focus-within:ring-[color:var(--accent,#2F7BF5)]`}
    >
      <Icon name="search" className="size-5 shrink-0 text-black/35" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-xs placeholder:text-black/30"
        placeholder={placeholder}
        aria-label="정책 검색어"
      />
      {buttonLabel && (
        <button className="shrink-0 rounded-xl bg-[color:var(--accent,#2F7BF5)] px-3.5 py-2 text-xs font-extrabold text-white">
          {buttonLabel}
        </button>
      )}
    </form>
  )
}
