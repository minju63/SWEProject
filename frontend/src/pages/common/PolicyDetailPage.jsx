import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPolicy, fetchEligibility } from '../../api/policies';
import { useAuthStore } from '../../store/authStore';
import { ELIGIBILITY_LABEL, dDayText } from '../../utils/format';
import StateMessage from '../../components/StateMessage.jsx';

export default function PolicyDetailPage() {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const policy = useQuery({ queryKey: ['policy', policyId], queryFn: () => fetchPolicy(policyId) });
  const eligibility = useQuery({
    queryKey: ['eligibility', policyId],
    queryFn: () => fetchEligibility(policyId),
    enabled: !!user,
  });

  if (!policy.data) return <StateMessage isLoading={policy.isLoading} error={policy.error} />;
  const p = policy.data;
  const badge = eligibility.data && ELIGIBILITY_LABEL[eligibility.data.result];

  return (
    <>
      <button className="back" onClick={() => navigate(-1)}>
        ‹ 뒤로
      </button>
      <div className="card-top">
        <span className="chip">{p.recruitment_status}</span>
        <span className="dday">{dDayText(p.d_day, p.recruitment_status)}</span>
      </div>
      <h1 className="detail-title">{p.title}</h1>
      {badge ? (
        <span className={badge.className}>{badge.text}</span>
      ) : (
        !user && <p className="hint">로그인하면 내 조건으로 신청 가능 여부를 볼 수 있어요.</p>
      )}

      <dl className="detail-list">
        <dt>지원 대상</dt>
        <dd>{p.target_summary ?? '확인필요'}</dd>
        <dt>지원 내용</dt>
        <dd>{p.support_content ?? '확인필요'}</dd>
        <dt>신청 기간</dt>
        <dd>
          {p.is_always_open
            ? '상시 모집'
            : `${p.application_start_date ?? '?'} ~ ${p.application_end_date ?? '?'}`}
        </dd>
        <dt>신청 방법</dt>
        <dd>{p.application_method ?? '확인필요'}</dd>
      </dl>

      {p.application_url && (
        <a className="primary-button" href={p.application_url} target="_blank" rel="noreferrer">
          공식 홈페이지에서 신청
        </a>
      )}
    </>
  );
}
