import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from './HomeScreen'
import { selectUnreadCount, useNotificationStore } from '../store/notificationStore'
export default function NotificationsScreen() {
  const navigate = useNavigate()
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const [filter, setFilter] = useState('전체')
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => filter === '전체' || notification.type === filter),
    [filter, notifications]
  )
  const unreadCount = useNotificationStore(selectUnreadCount)
  function openNotification(notification) {
    markRead(notification.id)
    if (notification.type === '신청') navigate('/my')
    else navigate('/search')
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
              onClick={() =>
                markAllRead()
              }
              className="text-[10px] font-extrabold text-[#2F7BF5]"
            >
              모두 읽음
            </button>
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {['전체', '혜택', '마감', '신청'].map((item) => (
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
                      name={
                        notification.type === '신청'
                          ? 'calendar'
                          : notification.type === '마감'
                            ? 'bell'
                            : 'sparkle'
                      }
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

            {visibleNotifications.length === 0 && (
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
