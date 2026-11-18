import { WEEKDAYS, monthCells } from './calendarUtils.js';

// 월간 달력 (FR-C01): 마감 ● / 신청 완료 ○ / 결과 발표 ★ 을 분야 색으로 표시한다
function Marker({ type, color }) {
  if (type === 'APPLIED')
    return <i className="cal-mark cal-mark-ring" style={{ borderColor: color }} />;
  if (type === 'RESULT')
    return (
      <i className="cal-mark cal-mark-star" style={{ color }}>
        ★
      </i>
    );
  return <i className="cal-mark cal-mark-dot" style={{ background: color }} />;
}

export default function CalendarGrid({
  year,
  month,
  today,
  selected,
  eventsByDate,
  colorOf,
  onPrev,
  onNext,
  onSelect,
}) {
  const cells = monthCells(year, month);
  return (
    <section className="cal-card" aria-label={`${year}년 ${month}월 달력`}>
      <div className="cal-nav">
        <button type="button" aria-label="이전 달" onClick={onPrev}>
          ‹
        </button>
        <strong>
          {year}년 {month}월
        </strong>
        <button type="button" aria-label="다음 달" onClick={onNext}>
          ›
        </button>
      </div>
      <div className="cal-week" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? 'cal-sun' : i === 6 ? 'cal-sat' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid" role="grid">
        {cells.map((c) => {
          const events = eventsByDate.get(c.key) ?? [];
          const isToday = c.key === today;
          const isSel = c.key === selected;
          return (
            <button
              key={c.key}
              type="button"
              role="gridcell"
              aria-pressed={isSel}
              aria-label={`${c.key}${events.length ? ` 일정 ${events.length}개` : ''}`}
              className={`cal-day${c.inMonth ? '' : ' cal-out'}${isToday ? ' cal-today' : ''}${
                isSel ? ' cal-sel' : ''
              }${c.dow === 0 ? ' cal-sun' : c.dow === 6 ? ' cal-sat' : ''}`}
              onClick={() => onSelect(c.key)}
            >
              <span className="cal-num">{c.day}</span>
              <span className="cal-marks">
                {events.slice(0, 3).map((e, i) => (
                  <Marker key={i} type={e.type} color={colorOf(e.policy_id)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="cal-legend">
        <span>
          <i className="cal-mark cal-mark-dot" style={{ background: '#6b7684' }} /> 마감
        </span>
        <span>
          <i className="cal-mark cal-mark-ring" style={{ borderColor: '#6b7684' }} /> 신청 완료
        </span>
        <span>
          <i className="cal-mark cal-mark-star" style={{ color: '#6b7684' }}>
            ★
          </i>{' '}
          결과 발표
        </span>
        <span className="cal-legend-sub">· 색 = 분야</span>
      </p>
    </section>
  );
}
