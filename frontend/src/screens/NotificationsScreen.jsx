import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from './HomeScreen'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications'
import { UNREAD_KEY } from '../components/NotificationBell'
import { useAuthStore } from '../store/authStore'

const LIST_KEY = ['notifications', 'list']
// 알림 종류: 서버 값(DEADLINE·NEW_MATCH·SYSTEM)을 화면 이름과 버튼 문구로 바꾼다
const TYPES = {
  DEADLINE: { label: '마감', action: '혜택 확인', icon: 'bell' },
  NEW_MATCH: { label: '혜택', action: '추천 보기', icon: 'sparkle' },
  SYSTEM: { label: '안내', action: '자세히 보기', icon: 'calendar' },
}
const typeOf = (n) => TYPES[n.type] ?? TYPES.SYSTEM

// "10분 전", "1시간 전", "어제", "5월 28일"
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day === 1) return '어제'
  if (day < 7) return `${day}일 전`
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

export default function NotificationsScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: fetchNotifications,
    enabled: Boolean(user),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY })
    queryClient.invalidateQueries({ queryKey: UNREAD_KEY })
  }
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh })
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh })

  const notifications = useMemo(
    () =>
      (list.data ?? []).map((n) => ({
        id: n.notification_id,
        type: typeOf(n).label,
        action: typeOf(n).action,
        icon: typeOf(n).icon,
        title: n.title,
        description: n.body ?? '',
        time: timeAgo(n.created_at),
        unread: !n.is_read,
        link: n.link,
      })),
    [list.data]
  )
  const [filter, setFilter] = useState('전체')
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => filter === '전체' || notification.type === filter),
    [filter, notifications]
  )
  const unreadCount = notifications.filter((notification) => notification.unread).length
  function openNotification(notification) {
    if (notification.unread) readOne.mutate(notification.id)
    navigate(notification.link || '/search')
  }
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="relative mx-auto min-h-screen max-w-[480px] overflow-hidden bg-[#f7f8fb] text-[#171923] shadow-[0_0_40px_rgba(23,25,35,0.08)]">
        <header className="sticky top-0 z-40 bg-white/95 px-5 pb-4 pt-3 backdrop-blur-xl">
          <div className="flex h-11 items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="-ml-2 grid size-10 place-items-center rounded-full"
              aria-label="뒤로 가기"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <h1 className="text-[18px] font-black tracking-[-0.04em]">알림</h1>
            <button
              onClick={() => user && unreadCount > 0 && readAll.mutate()}
              className="text-[10px] font-extrabold text-[#2F7BF5]"
            >
              모두 읽음
            </button>
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {['전체', '혜택', '마감', '안내'].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-extrabold ${filter === item ? 'bg-[#2F7BF5] text-white' : 'bg-[#f3f4f7] text-black/40'}`}
              >
                {item}
                {item === '전체' && unreadCount > 0 && (
                  <span
                    className={`ml-1.5 ${filter === item ? 'text-white/70' : 'text-[#2F7BF5]'}`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="pb-10">
          <section className="px-5 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-extrabold text-black/35">
                {filter === '전체' ? '최근 알림' : `${filter} 알림`}
              </h2>
              <p className="text-[9px] font-semibold text-black/25">최근 30일</p>
            </div>
            <div className="space-y-3">
              {visibleNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  className={`relative flex w-full gap-3 rounded-[20px] border p-4 text-left transition active:scale-[0.99] ${notification.unread ? 'border-[#2F7BF5]/15 bg-white shadow-[0_5px_18px_rgba(23,25,35,0.04)]' : 'border-black/[0.05] bg-white/70'}`}
                >
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-2xl ${notification.unread ? 'bg-[#f1f3fb] text-[#2F7BF5]' : 'bg-[#f1f2f4] text-black/25'}`}
                  >
                    <Icon
                      name={notification.icon}
                      className="size-5"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <b
                        className={`text-[13px] leading-5 ${notification.unread ? 'font-black' : 'font-bold text-black/55'}`}
                      >
                        {notification.title}
                      </b>
                      <small className="shrink-0 text-[8px] font-semibold text-black/25">
                        {notification.time}
                      </small>
                    </span>
                    <span className="mt-1.5 block text-[11px] font-medium leading-[18px] text-black/40">
                      {notification.description}
                    </span>
                    <span className="mt-3 inline-flex items-center gap-1 text-[9px] font-extrabold text-[#2F7BF5]">
                      {notification.action} <Icon name="arrow" className="size-3" />
                    </span>
                  </span>
                  {notification.unread && (
                    <span className="absolute right-3 top-3 size-2 rounded-full bg-[#2F7BF5]" />
                  )}
                </button>
              ))}
            </div>

            {!user && (
              <div className="rounded-[22px] bg-white py-14 text-center">
                <p className="text-sm font-black">로그인하면 알림을 볼 수 있어요</p>
                <button
                  onClick={() => navigate('/my')}
                  className="mt-4 rounded-xl bg-[#2F7BF5] px-4 py-2 text-[11px] font-extrabold text-white"
                >
                  마이에서 로그인하기
                </button>
              </div>
            )}
            {user && list.isLoading && (
              <p className="py-14 text-center text-[11px] font-medium text-black/35">불러오는 중…</p>
            )}
            {user && list.error && (
              <p className="py-14 text-center text-[11px] font-medium text-black/45">
                알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            )}
            {user && !list.isLoading && !list.error && visibleNotifications.length === 0 && (
              <div className="rounded-[22px] bg-white py-14 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#f1f3fb] text-[#2F7BF5]">
                  <Icon name="bell" className="size-5" />
                </span>
                <p className="mt-3 text-sm font-black">새로운 알림이 없어요</p>
                <p className="mt-1 text-[11px] font-medium text-black/35">
                  필요한 혜택 소식이 생기면 알려드릴게요.
                </p>
              </div>
            )}
          </section>

          <section className="mx-5 mt-6 rounded-[20px] bg-[#f1f3fb] p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-[#2F7BF5]">
                <Icon name="settings" className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black">받고 싶은 알림만 선택하세요</p>
                <p className="mt-1 text-[9px] font-medium text-black/35">
                  정책, 문화행사, 마감 알림을 설정할 수 있어요.
                </p>
              </div>
              <button
                onClick={() => navigate('/settings?view=notifications')}
                className="rounded-xl bg-white px-3 py-2 text-[9px] font-extrabold text-[#2F7BF5]"
              >
                알림 설정
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
