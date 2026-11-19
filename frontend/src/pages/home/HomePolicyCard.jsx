import { Link } from 'react-router-dom';
import { HeartIcon } from '../../components/icons.jsx';
import { ELIGIBILITY_LABEL, dDayText } from '../../utils/format';

// 검색 결과 카드와 같은 배치·디자인: 왼쪽 위에 배지(자격·분야·지역), 오른쪽 위에 D-day → 하트 순서
const ELIGIBILITY_TONE = { ELIGIBLE: 'eligible', CHECK: 'check', INELIGIBLE: 'ineligible' };
const CATEGORY_TONE = {
  '주거·생활': 'blue',
  '취업·진로': 'pink',
  '장학·금융': 'purple',
  문화: 'green',
  '공간·시설': 'purple',
};

export default function HomePolicyCard({ policy, categoryName, onToggleBookmark }) {
  const badge = ELIGIBILITY_LABEL[policy.eligibility];
  const off = policy.eligibility === 'INELIGIBLE';
  const urgent = policy.d_day != null && policy.d_day >= 0 && policy.d_day <= 7 && policy.recruitment_status !== '상시';
  return (
    <div className={`hcard search-policy-card${off ? ' hcard-off' : ''}`}>
      <Link to={`/policies/${policy.policy_id}`} className="hcard-link">
        <div className="search-policy-top">
          <div className="search-policy-tags">
            {badge && (
              <span className={`search-policy-tag--${ELIGIBILITY_TONE[policy.eligibility]}`}>
                {badge.text}
              </span>
            )}
            {categoryName && (
              <span className={`search-policy-tag--${CATEGORY_TONE[categoryName] ?? 'blue'}`}>
                {categoryName}
              </span>
            )}
            {policy.region_names[0] && (
              <span className="search-policy-tag--region">{policy.region_names[0]}</span>
            )}
          </div>
        </div>
        <div className="search-policy-main">
          <h3>{policy.title}</h3>
          {policy.support_content && <p>{policy.support_content}</p>}
        </div>
      </Link>
      <div className="hcard-corner">
        <strong className={`search-policy-dday${urgent ? ' is-urgent' : ''}`}>
          {dDayText(policy.d_day, policy.recruitment_status)}
        </strong>
        <button
          type="button"
          className={`heart${policy.bookmarked ? ' heart-on' : ''}`}
          aria-label={policy.bookmarked ? '찜 해제' : '찜하기'}
          aria-pressed={policy.bookmarked}
          onClick={() => onToggleBookmark(policy)}
        >
          <HeartIcon />
        </button>
      </div>
    </div>
  );
}
