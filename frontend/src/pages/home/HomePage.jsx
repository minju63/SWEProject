import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchHealth, fetchPolicies } from '../../api/policies';
import PageHeader from '../../components/PageHeader.jsx';
import PolicyCard from '../../components/PolicyCard.jsx';
import StateMessage from '../../components/StateMessage.jsx';

export default function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  const policies = useQuery({
    queryKey: ['policies', { page: 1, size: 3 }],
    queryFn: () => fetchPolicies({ page: 1, size: 3 }),
  });

  return (
    <>
      <PageHeader title="청해" />
      <p className="server-status">
        API 서버: {health.isLoading ? '확인 중' : health.error ? '연결 안 됨' : '연결됨'}
      </p>

      <section className="section">
        <div className="section-head">
          <h2>마감 임박 혜택</h2>
          <Link to="/search">전체 보기 ›</Link>
        </div>
        <StateMessage
          isLoading={policies.isLoading}
          error={policies.error}
          isEmpty={policies.data?.items.length === 0}
          emptyText="아직 등록된 정책이 없어요."
        />
        {policies.data?.items.map((p) => (
          <PolicyCard key={p.policy_id} policy={p} />
        ))}
      </section>
    </>
  );
}
