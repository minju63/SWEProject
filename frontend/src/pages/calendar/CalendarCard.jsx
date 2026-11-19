import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellFillIcon, HeartIcon } from '../../components/icons.jsx';
import { alarmLabel, shortDate } from './calendarUtils.js';

const EVENT_TAG = { DEADLINE: '마감', APPLIED: '신청 완료', RESULT: '결과 발표' };

// 정책 카드 (FR-C04~C06): 위쪽은 상세로, ♥는 찜 해제, 아래 띠는 알림 설정
export default function CalendarCard({
  item,
  state, // 'active' | 'always' | 'closed'
  eventTypes = [], // 날짜를 골랐을 때 그날 일정 종류
  onUnbookmark,
  onEditAlarm,
  onToggleDoc,
}) {
  const [docsOpen, setDocsOpen] = useState(false); // 기본은 접어서 진행 상황만, 누르면 신청 준비물 목록이 펼쳐진다
  const documents = item.documents ?? [];
  const urgent = state === 'active' && item.d_day != null && item.d_day <= 7;
  // 찜한 정책과 신청 준비 중인 정책에 알림을 붙인다 (FR-COM-04)
  const canAlarm = (item.bookmarked || item.stage === 'PREPARING') && state === 'active';
  const alarms = item.alarms ?? [];
  const label =
    state === 'closed'
      ? '마감'
      : state === 'always'
        ? '상시'
        : item.d_day === 0
          ? 'D-day'
          : `D-${item.d_day}`;
  const end = item.application_end_date;

  // 날짜를 골라서 열린 카드: 마감이 아닌 일정(신청 완료·결과 발표)이면 그날 일정을 앞에 보여준다.
  // (신청 완료일에 마감일이 한참 뒤여도 "왜 이 날 있지?"가 되지 않게)
  const dayEvent = eventTypes.length > 0 && !eventTypes.includes('DEADLINE') ? eventTypes[0] : null;
  const dayDate = dayEvent === 'APPLIED' ? item.applied_at : item.expected_result_date;

  return (
    <article className={`ccard${state === 'closed' ? ' ccard-closed' : ''}`}>
      <div className="ccard-main">
        <Link to={`/policies/${item.policy_id}`} className="ccard-link">
          <span
            className={`ccard-dday${urgent && !dayEvent ? ' ccard-dday-urgent' : ''}${
              dayEvent ? ' ccard-dday-event' : ''
            }`}
          >
            {dayEvent ? (dayEvent === 'APPLIED' ? '완료' : '발표') : label}
          </span>
          <span className="ccard-body">
            <strong className="ccard-title">
              {item.title}
              {item.stage === 'PREPARING' && <em className="ccard-prep">신청 준비</em>}
              {eventTypes.map((t) => (
                <em key={t} className="ccard-event">
                  {EVENT_TAG[t]}
                </em>
              ))}
            </strong>
            <span className={`ccard-meta${urgent && !dayEvent ? ' ccard-meta-urgent' : ''}`}>
              {dayEvent ? (
                <>
                  <b>
                    {EVENT_TAG[dayEvent]} {shortDate(dayDate)}
                  </b>
                  {end && state !== 'always' && ` · 마감 ${shortDate(end)}`}
                </>
              ) : (
                <>{end && state !== 'always' ? `${shortDate(end)} 23:59` : '상시 모집'}</>
              )}
              {item.region_names?.[0] && ` · ${item.region_names[0]}`}
            </span>
            {documents.length === 0 && (
              <span className="ccard-docs ccard-docs-none">신청 준비물 정보 없음</span>
            )}
          </span>
        </Link>
        {item.bookmarked && (
          <button
            type="button"
            className="heart heart-on ccard-heart"
            aria-label="찜 해제"
            onClick={() => onUnbookmark(item)}
          >
            <HeartIcon />
          </button>
        )}
      </div>
      {documents.length > 0 && (
        <div className="ccard-checklist">
          <button
            type="button"
            className="ccard-checklist-head"
            aria-expanded={docsOpen}
            onClick={() => setDocsOpen((v) => !v)}
          >
            <i className={`ccard-chev${docsOpen ? ' open' : ''}`} aria-hidden="true" />
            <span>신청 준비물</span>
            <span className="ccard-bar" aria-hidden="true">
              <i style={{ width: `${item.docs_total ? (item.docs_checked / item.docs_total) * 100 : 0}%` }} />
            </span>
            <b>
              {item.docs_checked}/{item.docs_total}
            </b>
          </button>
          {docsOpen && (
            <ul>
              {documents.map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    className={d.checked ? 'on' : ''}
                    aria-pressed={d.checked}
                    onClick={() => onToggleDoc?.(item, d)}
                  >
                    <i aria-hidden="true">{d.checked ? '✓' : ''}</i>
                    <span>{d.name}</span>
                    {d.custom && <em>직접 추가</em>}
                    {d.required === false && <em>해당자만</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {canAlarm && (
        <button type="button" className="ccard-alarm" onClick={() => onEditAlarm(item)}>
          {alarms.length > 0 ? (
            <>
              <span className="ccard-alarm-text">
                <BellFillIcon /> {alarms.map((a) => alarmLabel(a)).join(' · ')}
              </span>
              <b>변경 ›</b>
            </>
          ) : (
            <>
              <span className="ccard-alarm-text">＋ 알림 추가</span>
              <b>›</b>
            </>
          )}
        </button>
      )}
    </article>
  );
}
