import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCalendar } from '../../api/calendar.js';
import { removeBookmark } from '../../api/me.js';
import { fetchCategories } from '../../api/policies.js';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import PageHeader from '../../components/PageHeader.jsx';
import StateMessage from '../../components/StateMessage.jsx';
import { CATEGORY_STYLE } from '../home/homeConfig.js';
import CalendarGrid from './CalendarGrid.jsx';
import CalendarCard from './CalendarCard.jsx';
import AlarmSheet from './AlarmSheet.jsx';
import { SAMPLE_ALARM_INFO, SAMPLE_CALENDAR } from './sampleData.js';
import { parseKey, shortDate } from './calendarUtils.js';
import './calendar.css';

const GRAY = '#8b95a1';

export default function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);
  // 개발 중에만: /calendar?preview=1 로 샘플 데이터 화면 확인 (로그인 없이)
  const preview = import.meta.env.DEV && params.get('preview') === '1';
  const signedIn = Boolean(user) || preview;

  const calendar = useQuery({
    queryKey: ['calendar', preview],
    queryFn: () => (preview ? Promise.resolve(SAMPLE_CALENDAR) : fetchCalendar()),
    enabled: signedIn,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const today = calendar.data?.today;
  const [month, setMonth] = useState(null); // { y, m }
  const [selected, setSelected] = useState(null); // 'YYYY-MM-DD'
  const [alarmFor, setAlarmFor] = useState(null); // policy_id
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

  const unbookmark = useMutation({
    mutationFn: (item) => (preview ? Promise.resolve() : removeBookmark(item.policy_id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      showToast('찜을 해제했어요. 알림도 함께 취소했어요');
    },
    onError: (e) => showToast(e.message),
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
      onEditAlarm={(i) => setAlarmFor(i.policy_id)}
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
            onClick={() => navigate('/my?section=alarm')}
          >
            ☼ 알림 설정
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
                  <h2>♥ 찜·신청 준비·마감순</h2>
                  <span>{active.length + always.length}건</span>
                </div>
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

      {alarmFor && (
        <AlarmSheet
          policyId={alarmFor}
          preview={preview ? SAMPLE_ALARM_INFO : null}
          onClose={() => setAlarmFor(null)}
        />
      )}
    </div>
  );
}
