import { useNavigate } from 'react-router'
import { AppShell, BottomNav, ScreenHeader, accentTheme } from './PolicyLayout'
import { Icon } from '../screens/HomeScreen'
export default function PolicyNotFound({ title = '정책을 찾을 수 없어요.' }) {
  const navigate = useNavigate()
  return (
    <AppShell className={accentTheme}>
      <ScreenHeader title="정책 안내" />
      <main className="px-5 pb-28 pt-8">
        <div className="rounded-[22px] border border-black/[0.06] bg-white px-5 py-12 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#EAF2FE] text-[#2F7BF5]">
            <Icon name="search" className="size-6" />
          </span>
          <h1 className="mt-5 text-lg font-black tracking-[-0.04em]">{title}</h1>
          <p className="mt-2 text-xs font-medium leading-5 text-black/40">
            검색에서 다른 혜택을 찾아보세요.
          </p>
          <button
            onClick={() => navigate('/search')}
            className="mt-6 rounded-2xl bg-[#2F7BF5] px-5 py-3.5 text-xs font-extrabold text-white"
          >
            정책 검색으로 돌아가기
          </button>
        </div>
      </main>
      <BottomNav active="검색" />
    </AppShell>
  )
}
