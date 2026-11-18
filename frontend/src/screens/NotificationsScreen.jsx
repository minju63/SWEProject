import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from './HomeScreen'
const initialNotifications = [
  {
    id: 1,
    type: '마감',
    title: '찜한 혜택이 곧 마감돼요',
    description: '부산 청년 교통비 지원(예시 정책)이 5일 후 마감돼요.',
    time: '10분 전',
    unread: true,
    action: '혜택 확인',
  },
  {
    id: 2,
    type: '신청',
    title: '신청 상태를 확인해주세요',
    description: '청년도약계좌의 신청 상태를 공식 사이트에서 확인한 뒤 직접 변경해주세요.',
    time: '1시간 전',
    unread: true,
    action: '신청 관리',
  },
  {
    id: 3,
    type: '혜택',
    title: '은혜님을 위한 새로운 혜택',
    description: '사하구 청년 생활안정 지원사업(예시 정책)을 확인해보세요.',
    time: '오늘 오전 9:20',
    unread: true,
    action: '추천 보기',
  },
  {
    id: 4,
    type: '혜택',
    title: '부산진구 맞춤 정책이 추가됐어요',
    description: '부산진구 청년 취업역량 강화사업(예시 정책)이 등록됐어요.',
    time: '어제',
    unread: false,
    action: '정책 확인',
  },
  {
    id: 5,
    type: '신청',
    title: '결과 발표 예정일이에요',
    description: '사하구 청년 생활안정 지원사업의 결과를 공식 사이트에서 확인해주세요.',
    time: '5월 28일',
    unread: false,
    action: '결과 확인',
  },
]
export default function NotificationsScreen() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState('전체')
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => filter === '전체' || notification.type === filter),
    [filter, notifications]
  )
  const unreadCount = notifications.filter((notification) => notification.unread).length
  function openNotification(notification) {
    setNotifications((items) =>
      items.map((item) => (item.id === notification.id ? { ...item, unread: false } : item))
    )
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
                setNotifications((items) => items.map((item) => ({ ...item, unread: false })))
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
