import { Link } from 'react-router-dom';
import { dDayText } from '../utils/format';

export default function PolicyCard({ policy }) {
  return (
    <Link to={`/policies/${policy.policy_id}`} className="card">
      <div className="card-top">
        <span className="chip">{policy.recruitment_status ?? '기간 미정'}</span>
        <span className="dday">{dDayText(policy.d_day, policy.recruitment_status)}</span>
      </div>
      <strong className="card-title">{policy.title}</strong>
      {policy.support_content && <p className="card-desc">{policy.support_content}</p>}
    </Link>
  );
}
