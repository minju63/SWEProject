import { Link } from 'react-router-dom';
import { ELIGIBILITY_LABEL, dDayText } from '../../utils/format';

export default function HomePolicyCard({ policy, onToggleBookmark }) {
  const badge = ELIGIBILITY_LABEL[policy.eligibility];
  const off = policy.eligibility === 'INELIGIBLE';
  const urgent = policy.d_day != null && policy.d_day <= 7;
  return (
    <div className={`hcard${off ? ' hcard-off' : ''}`}>
      <Link to={`/policies/${policy.policy_id}`} className="hcard-link">
        <div className="hcard-top">
          <span>
            <span className={badge.className}>{off ? '✕ 대상 아님' : badge.text}</span>{' '}
            {policy.region_names[0] && (
              <span className="region-chip">{policy.region_names[0]}</span>
            )}
          </span>
          <span className={`dday${urgent ? ' dday-urgent' : ''}`}>
            {dDayText(policy.d_day, policy.recruitment_status)}
          </span>
        </div>
        <strong className="hcard-title">{policy.title}</strong>
        {policy.support_content && <p className="hcard-desc">{policy.support_content}</p>}
      </Link>
      <button
        type="button"
        className={`heart${policy.bookmarked ? ' heart-on' : ''}`}
        aria-label={policy.bookmarked ? '찜 해제' : '찜하기'}
        aria-pressed={policy.bookmarked}
        onClick={() => onToggleBookmark(policy)}
      >
        {policy.bookmarked ? '♥' : '♡'}
      </button>
    </div>
  );
}
