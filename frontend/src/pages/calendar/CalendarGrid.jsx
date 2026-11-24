import { useState } from 'react';
import { CATEGORY_ORDER, CATEGORY_STYLE } from '../home/homeConfig.js';
import { WEEKDAYS, monthCells } from './calendarUtils.js';

// 월간 달력 (FR-C01): 마감 ● / 신청 완료 ○ / 결과 확인 ★ 을 분야 색으로 표시한다
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
  onJump,
  onSelect,
}) {
  const cells = monthCells(year, month);
  // 가운데 "2026년 11월"을 누르면 연·월을 골라 바로 이동한다
  const [pickYear, setPickYear] = useState(null); // 열려 있으면 고르는 중인 연도, 닫혀 있으면 null
  const todayYM = today ? { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) } : null;
  return (
    <section className="cal-card" aria-label={`${year}년 ${month}월 달력`}>
      <div className="cal-nav">
        <button type="button" aria-label="이전 달" onClick={onPrev}>
          ‹
        </button>
        <button
          type="button"
          className="cal-title"
          aria-label="연·월 선택"
          aria-expanded={pickYear != null}
          onClick={() => setPickYear(pickYear == null ? year : null)}
        >
          {year}년 {month}월
        </button>
        <button type="button" aria-label="다음 달" onClick={onNext}>
          ›
        </button>
      </div>
      {pickYear != null && (
        <div className="cal-picker">
          <div className="cal-picker-year">
            <button type="button" aria-label="이전 해" onClick={() => setPickYear(pickYear - 1)}>
              ‹
            </button>
            <strong>{pickYear}년</strong>
            <button type="button" aria-label="다음 해" onClick={() => setPickYear(pickYear + 1)}>
              ›
            </button>
          </div>
          <div className="cal-picker-months">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const on = pickYear === year && m === month;
              const isNow = todayYM && pickYear === todayYM.y && m === todayYM.m;
              return (
                <button
                  key={m}
                  type="button"
                  className={`${on ? 'on' : ''}${isNow ? ' now' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    onJump(pickYear, m);
                    setPickYear(null);
                  }}
                >
                  {m}월
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="cal-week" aria-hidden="true" hidden={pickYear != null}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? 'cal-sun' : i === 6 ? 'cal-sat' : ''}>
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid" role="grid" hidden={pickYear != null}>
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
      <div className="cal-legend">
        <p>
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
            결과 확인
          </span>
        </p>
        <p className="cal-legend-colors">
          {CATEGORY_ORDER.map((name) => (
            <span key={name}>
              <i
                className="cal-mark cal-mark-dot"
                style={{ background: CATEGORY_STYLE[name].color }}
              />{' '}
              {name}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
