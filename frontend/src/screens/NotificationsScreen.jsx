import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useNotifications } from '../lib/notifications';
import { Icon } from './HomeScreen';
const groups = ['전체', '맞춤 혜택', '정책', '문화행사', '주변 시설', '마감', '신청', '기타'];
function destination(item) {
  if (item.policy_id && /^[0-9a-f-]{36}$/i.test(item.policy_id))
    return '/policies/' + item.policy_id;
  if (typeof item.link === 'string' && /^\/(my|map|search)(?:[/?]|$)/.test(item.link))
    return item.link;
  return '/my';
}
export default function NotificationsScreen() {
  const navigate = useNavigate(),
    [filter, setFilter] = useState('전체'),
    [error, setError] = useState('');
  const { items, unreadCount, isPending, isError, refetch, markRead, marking, readError } =
    useNotifications();
  const visible = items.filter((n) => filter === '전체' || n.group === filter);
  async function open(item) {
    setError('');
    try {
      await markRead(item.notification_id);
      navigate(destination(item));
    } catch {
      setError('읽음 상태를 저장하지 못했어요. 다시 시도해주세요.');
    }
  }
  return (
    <main className="min-h-screen bg-[#eef0f5] px-5 pb-24 pt-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기">
          ‹
        </button>
        <h1 className="text-xl font-black">알림</h1>
        <button
          className="text-sm font-bold text-[#2F7BF5]"
          disabled={marking || !unreadCount}
          onClick={() =>
            markRead('all').catch(() =>
              setError('읽음 상태를 저장하지 못했어요. 다시 시도해주세요.')
            )
          }
        >
          모두 읽음
        </button>
      </header>
      <div
        className="no-scrollbar my-5 flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="알림 유형"
      >
        {groups.map((group) => (
          <button
            key={group}
            role="tab"
            aria-selected={filter === group}
            onClick={() => setFilter(group)}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${filter === group ? 'bg-[#2F7BF5] text-white' : 'bg-white text-slate-600'}`}
          >
            {group}
            {group === '전체' && unreadCount > 0
              ? ` ${unreadCount > 99 ? '99+' : unreadCount}`
              : ''}
          </button>
        ))}
      </div>
      {(error || readError) && <p role="alert">{error || '읽음 상태를 저장하지 못했어요.'}</p>}
      {isPending ? (
        <p role="status">알림을 불러오고 있어요.</p>
      ) : isError ? (
        <section role="alert">
          알림을 불러오지 못했어요. <button onClick={() => refetch()}>다시 시도</button>
        </section>
      ) : (
        <section className="space-y-3" aria-label="알림 목록">
          {visible.map((item) => (
            <button
              key={item.notification_id}
              disabled={marking}
              onClick={() => open(item)}
              className={`block w-full rounded-2xl bg-white p-4 text-left ${item.is_read ? 'opacity-60' : 'border border-blue-200 shadow-sm'}`}
            >
              <span className="flex justify-between text-xs text-slate-500">
                <span>
                  {item.group}
                  {!item.is_read ? ' · 안 읽음' : ''}
                </span>
                <time>
                  {new Date(item.created_at).toLocaleDateString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}
                </time>
              </span>
              <strong className="mt-2 block">{item.title}</strong>
              <p className="mt-2 text-sm text-slate-600">{item.body}</p>
              <span className="mt-3 block text-xs font-bold text-[#2F7BF5]">내용 확인 ›</span>
            </button>
          ))}
          {!visible.length && (
            <p className="rounded-2xl bg-white px-5 py-14 text-center">표시할 알림이 없어요.</p>
          )}
        </section>
      )}
      <button
        onClick={() => navigate('/settings?view=notifications')}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 font-bold text-[#2F7BF5]"
      >
        <Icon name="settings" />
        알림 설정
      </button>
    </main>
  );
}
