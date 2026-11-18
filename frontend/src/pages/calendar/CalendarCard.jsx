import { Link } from 'react-router-dom';
import { alarmLabel, shortDate } from './calendarUtils.js';

const EVENT_TAG = { DEADLINE: '마감', APPLIED: '신청 완료', RESULT: '결과 발표' };

// 정책 카드 (FR-C04~C06): 위쪽은 상세로, ♥는 찜 해제, 아래 띠는 알림 설정
export default function CalendarCard({
  item,
  state, // 'active' | 'always' | 'closed'
  eventTypes = [], // 날짜를 골랐을 때 그날 일정 종류
  onUnbookmark,
  onEditAlarm,
}) {
  const urgent = state === 'active' && item.d_day != null && item.d_day <= 7;
  const canAlarm = item.bookmarked && state === 'active';
  const alarms = item.alarms ?? [];
  const label =
    state === 'closed'
      ? '마감'
      : state === 'always'
        ? '상시'
        : item.d_day === 0
          ? 'D-DAY'
          : `D-${item.d_day}`;
  const end = item.application_end_date;

  return (
    <article className={`ccard${state === 'closed' ? ' ccard-closed' : ''}`}>
      <div className="ccard-main">
        <Link to={`/policies/${item.policy_id}`} className="ccard-link">
          <span className={`ccard-dday${urgent ? ' ccard-dday-urgent' : ''}`}>{label}</span>
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
            <span className={`ccard-meta${urgent ? ' ccard-meta-urgent' : ''}`}>
              {end && state !== 'always' ? `${shortDate(end)} 23:59` : '상시 모집'}
              {item.region_names?.[0] && ` · ${item.region_names[0]}`}
            </span>
            {item.docs_total > 0 ? (
              <span className="ccard-docs">
                <span className="ccard-bar">
                  <i style={{ width: `${(item.docs_checked / item.docs_total) * 100}%` }} />
                </span>
                <b>
                  서류 {item.docs_checked}/{item.docs_total}
                </b>
              </span>
            ) : (
              <span className="ccard-docs ccard-docs-none">서류 정보 없음</span>
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
            ♥
          </button>
        )}
      </div>
      {canAlarm && (
        <button type="button" className="ccard-alarm" onClick={() => onEditAlarm(item)}>
          {alarms.length > 0 ? (
            <>
              <span className="ccard-alarm-text">
                🔔 {alarms.map((a) => alarmLabel(a)).join(' · ')}
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
