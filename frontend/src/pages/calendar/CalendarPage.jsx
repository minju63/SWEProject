import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCalendar } from '../../api/calendar.js';
import { addBookmark, removeBookmark } from '../../api/me.js';
import { setDocumentChecked } from '../../api/calendar.js';
import { fetchCategories } from '../../api/policies.js';
import { useAuthStore } from '../../store/authStore';
import { UNBOOKMARK_TOAST, useToastStore } from '../../store/toastStore';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsIcon } from '../../components/icons.jsx';
import StateMessage from '../../components/StateMessage.jsx';
import { CATEGORY_STYLE } from '../home/homeConfig.js';
import CalendarGrid from './CalendarGrid.jsx';
import CalendarCard from './CalendarCard.jsx';
import AlarmSheet from './AlarmSheet.jsx';
import DefaultAlarmSheet from './DefaultAlarmSheet.jsx';
import { parseKey, shortDate } from './calendarUtils.js';
import './calendar.css';

const GRAY = '#8b95a1';

export default function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);
  const signedIn = Boolean(user);

  const calendar = useQuery({
    queryKey: ['calendar'],
    queryFn: fetchCalendar,
    enabled: signedIn,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const today = calendar.data?.today;
  const [month, setMonth] = useState(null); // { y, m }
  const [selected, setSelected] = useState(null); // 'YYYY-MM-DD'
  const [alarmFor, setAlarmFor] = useState(null); // policy_id
  const [defaultsOpen, setDefaultsOpen] = useState(false); // 기본 알림 설정 시트
  const shown = month ?? (today ? { y: parseKey(today).y, m: parseKey(today).m } : null);

  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.category_id, c.category_name])),
    [categories.data]
  );
  const itemOf = useMemo(
    () => new Map((calendar.data?.items ?? []).map((i) => [i.policy_id, i])),
    [calendar.data]
  );
  const colorOf = (policyId) => {
    const id = itemOf.get(policyId)?.category_id;
    // 샘플 데이터는 분야 이름을 'CAT:이름' 으로 가진다
    const name = categoryName.get(id) ?? (String(id).startsWith('CAT:') ? id.slice(4) : null);
    return CATEGORY_STYLE[name]?.color ?? GRAY;
  };

  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const e of calendar.data?.events ?? []) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    return map;
  }, [calendar.data]);

  // 찜하지 않은 신청 준비 정책의 하트를 눌러 찜한다: 누르는 즉시 하트를 바꾸고 서버 결과로 다시 맞춘다
  const bookmark = useMutation({
    mutationFn: (item) => addBookmark(item.policy_id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['calendar'] });
      const before = queryClient.getQueryData(['calendar']);
      queryClient.setQueryData(['calendar'], (cur) =>
        cur
          ? {
              ...cur,
              items: cur.items.map((i) =>
                i.policy_id === item.policy_id ? { ...i, bookmarked: true } : i
              ),
            }
          : cur
      );
      showToast('찜했어요!', { duration: 1000 });
      return { before };
    },
    onError: (e, _item, ctx) => {
      if (ctx?.before) queryClient.setQueryData(['calendar'], ctx.before);
      showToast(e.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });

  const unbookmark = useMutation({
    mutationFn: (item) => removeBookmark(item.policy_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      showToast(UNBOOKMARK_TOAST);
    },
    onError: (e) => showToast(e.message),
  });

  // 준비물 체크: 누르는 즉시 화면을 바꾸고 서버(마이·정책 상세와 같은 저장소)에 저장한다. 실패하면 원래대로 되돌린다
  const toggleDoc = useMutation({
    mutationFn: ({ item, doc }) => setDocumentChecked(item.policy_id, doc.key, !doc.checked),
    onMutate: async ({ item, doc }) => {
      await queryClient.cancelQueries({ queryKey: ['calendar'] });
      const before = queryClient.getQueryData(['calendar']);
      queryClient.setQueryData(['calendar'], (cur) =>
        cur
          ? {
              ...cur,
              items: cur.items.map((i) => {
                if (i.policy_id !== item.policy_id) return i;
                const documents = i.documents.map((d) =>
                  d.key === doc.key ? { ...d, checked: !doc.checked } : d
                );
                return { ...i, documents, docs_checked: documents.filter((d) => d.checked).length };
              }),
            }
          : cur
      );
      return { before };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.before) queryClient.setQueryData(['calendar'], ctx.before);
      showToast(e.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });

  const goMonth = (delta) =>
    setMonth(() => {
      const t = new Date(Date.UTC(shown.y, shown.m - 1 + delta, 1));
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
    });
  const pickDate = (key) => {
    setSelected((cur) => (cur === key ? null : key)); // 다시 누르면 해제 (FR-C02)
    const p = parseKey(key);
    if (p.y !== shown.y || p.m !== shown.m) setMonth({ y: p.y, m: p.m });
  };

  if (!signedIn) {
    return (
      <div className="cal-page">
        <PageHeader title="캘린더" />
        <p className="state">로그인하면 찜한 정책의 마감일과 알림을 달력에서 볼 수 있어요.</p>
        <Link to="/my" className="primary-button cal-login">
          마이에서 로그인하기
        </Link>
      </div>
    );
  }

  const data = calendar.data;
  const classify = (i) => {
    if (i.is_always_open || !i.application_end_date) return 'always';
    return i.application_end_date < today ? 'closed' : 'active';
  };
  const listed = (data?.items ?? []).filter((i) => i.bookmarked || i.stage === 'PREPARING');
  const byEnd = (a, b) =>
    (a.application_end_date ?? '').localeCompare(b.application_end_date ?? '') ||
    a.title.localeCompare(b.title, 'ko');
  const active = listed.filter((i) => classify(i) === 'active').sort(byEnd);
  const always = listed
    .filter((i) => classify(i) === 'always')
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const closed = listed.filter((i) => classify(i) === 'closed').sort((a, b) => byEnd(b, a));

  // 날짜를 고르면 그날 일정이 있는 항목만 (신청 완료·결과 발표 항목 포함)
  const dayEvents = selected ? (eventsByDate.get(selected) ?? []) : [];
  const dayItems = [...new Set(dayEvents.map((e) => e.policy_id))]
    .map((id) => itemOf.get(id))
    .filter(Boolean)
    .sort(byEnd);

  const card = (item, state, eventTypes) => (
    <CalendarCard
      key={item.policy_id}
      item={item}
      state={state}
      eventTypes={eventTypes}
      onUnbookmark={(i) => unbookmark.mutate(i)}
      onBookmark={(i) => bookmark.mutate(i)}
      onEditAlarm={(i) => setAlarmFor(i.policy_id)}
      onToggleDoc={(item, doc) => toggleDoc.mutate({ item, doc })}
    />
  );

  return (
    <div className="cal-page">
      <PageHeader
        title="캘린더"
        right={
          <button
            type="button"
            className="cal-alarm-btn"
            aria-label="알림 설정"
            onClick={() => setDefaultsOpen(true)}
          >
            <SettingsIcon />
          </button>
        }
      />
      <StateMessage isLoading={calendar.isLoading} error={calendar.error} />

      {data && shown && (
        <>
          <CalendarGrid
            year={shown.y}
            month={shown.m}
            today={today}
            selected={selected}
            eventsByDate={eventsByDate}
            colorOf={colorOf}
            onPrev={() => goMonth(-1)}
            onNext={() => goMonth(1)}
            onJump={(y, m) => setMonth({ y, m })}
            onSelect={pickDate}
          />

          {selected ? (
            <section className="cal-section">
              <div className="cal-section-head">
                <h2>{shortDate(selected)} 일정</h2>
                <button type="button" className="cal-clear" onClick={() => setSelected(null)}>
                  전체 보기
                </button>
              </div>
              {dayItems.length === 0 ? (
                <p className="state">이 날 일정이 없어요</p>
              ) : (
                dayItems.map((i) =>
                  card(
                    i,
                    classify(i),
                    dayEvents.filter((e) => e.policy_id === i.policy_id).map((e) => e.type)
                  )
                )
              )}
            </section>
          ) : (
            <>
              <section className="cal-section">
                <div className="cal-section-head">
                  <h2>
                    마감 임박순 <span>{active.length + always.length}건</span>
                  </h2>
                </div>
                <p className="cal-scope">찜한 정책과 신청 준비 중인 정책을 마감이 가까운 순서로 보여 줘요. 상시 모집은 아래에 모았어요.</p>
                {active.length + always.length === 0 && (
                  <p className="state">
                    찜한 정책이 없어요. 홈이나 검색에서 ♥를 눌러 마감일을 캘린더에 추가해 보세요.
                  </p>
                )}
                {active.map((i) => card(i, 'active'))}
                {always.length > 0 && (
                  <>
                    <h3 className="cal-sub">상시 모집</h3>
                    {always.map((i) => card(i, 'always'))}
                  </>
                )}
              </section>
              {closed.length > 0 && (
                <section className="cal-section">
                  <div className="cal-section-head">
                    <h2>마감됨</h2>
                    <span>{closed.length}건</span>
                  </div>
                  {closed.map((i) => card(i, 'closed'))}
                </section>
              )}
            </>
          )}
        </>
      )}

      {defaultsOpen && <DefaultAlarmSheet onClose={() => setDefaultsOpen(false)} />}

      {alarmFor && (
        <AlarmSheet
          policyId={alarmFor}
          onClose={() => setAlarmFor(null)}
        />
      )}
    </div>
  );
}
