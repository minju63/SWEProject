import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEligibility, fetchPolicy, fetchPolicyExplanation, fetchSimilarPolicies, recordPolicyView } from '../../api/policies';
import { addBookmark, removeBookmark } from '../../api/me';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { dDayText } from '../../utils/format';
import StateMessage from '../../components/StateMessage.jsx';
import { BackIcon, HeartIcon } from '../../components/icons.jsx';
import './PolicyDetailPage.css';

const verdicts = { ELIGIBLE: '신청 가능', CHECK: '확인 필요', INELIGIBLE: '신청 불가' };
const eligibilityTags = {
  ELIGIBLE: { text: '✓ 신청 가능', tone: 'eligible' },
  CHECK: { text: '확인 필요', tone: 'check' },
  INELIGIBLE: { text: '신청 불가', tone: 'ineligible' },
};
const categoryTagTone = {
  '주거·생활': 'blue', '취업·진로': 'pink', '장학·금융': 'purple',
  문화: 'green', '문화·예술': 'green', '복지·건강': 'purple',
};
const itemVerdicts = { SATISFIED: '충족', UNSATISFIED: '불충족', UNKNOWN: '확인 필요', NOT_APPLICABLE: '해당 없음' };
const conditionNames = {
  age: '나이 조건', region: '거주 지역', residence_months: '거주 기간',
  final_education: '학력', current_status: '현재 상태', housing_type: '주거 형태',
  household_type: '가구 형태', marital_status: '혼인 여부', special_targets: '특별 대상',
  income: '소득 조건', home_ownership: '주택 소유', household_role: '가구 내 지위',
  housing_benefit_status: '주거 급여', lives_separately: '독립 거주',
};

function dateText(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.` : String(value ?? '');
}

function periodText(p) {
  if (p.is_always_open) return '상시 모집';
  if (!p.application_start_date && !p.application_end_date) return '기간 미정';
  return `${dateText(p.application_start_date) || '시작일 미정'} ~ ${dateText(p.application_end_date) || '종료일 미정'}`;
}

function regionText(regions) {
  if (!regions?.length) return '지역 확인 필요';
  if (regions.includes('전국')) return '전국';
  if (regions.includes('부산광역시')) return '부산 전체';
  return regions.slice(0, 2).join(' · ');
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { return asArray(JSON.parse(value)); } catch { return []; }
}

function documentsFor(p) {
  return asArray(p.required_documents).map((item, index) => ({
    key: typeof item === 'object' && item?.key ? String(item.key) : `doc-${index}`,
    name: typeof item === 'string' ? item : item?.name,
  })).filter((item) => item.name);
}

function conditionName(item) {
  if (item.evidence?.source?.includes('.exclude')) return '제외 조건';
  if (item.field) return conditionNames[item.field] ?? '신청 조건';
  if (item.any) return '다음 중 하나';
  if (item.all) return '모두 충족';
  return '신청 조건';
}

function conditionValue(value) {
  if (value == null || value === '') return '정보 확인 필요';
  if (Array.isArray(value)) return value.map(conditionValue).join(' ~ ');
  if (typeof value === 'boolean') return value ? '예' : '아니요';
  return typeof value === 'object' ? '공식 공고 확인 필요' : String(value);
}

function policyCondition(item) {
  if (item.text) return item.text;
  if (item.children?.length) return item.children.map(policyCondition).join(item.any ? ' 또는 ' : ' 및 ');
  const value = item.evidence?.policy_value ?? item.value;
  if (item.field === 'age' && Array.isArray(value) && value.length === 2)
    return `만 ${value[0] ?? '제한 없음'}~${value[1] ?? '제한 없음'}세`;
  return conditionValue(value);
}

function userCondition(item) {
  if (item.evidence?.profile_value != null) {
    const value = conditionValue(item.evidence.profile_value);
    return item.field === 'age' ? `만 ${value}세` : value;
  }
  if (item.status === 'UNKNOWN') return '정보 없음 또는 추가 확인 필요';
  return '프로필 조건 비교 완료';
}

function externalUrl(url) {
  return /^https?:\/\//i.test(url ?? '') ? url : null;
}

async function fetchDetailState(userId, policyId) {
  const [application, checks] = await Promise.all([
    supabase.from('user_application').select('application_id, stage').eq('user_id', userId).eq('policy_id', policyId).maybeSingle(),
    supabase.from('user_document_check').select('doc_key, is_checked').eq('user_id', userId).eq('policy_id', policyId),
  ]);
  if (application.error) throw application.error;
  if (checks.error) throw checks.error;
  return { application: application.data, checks: checks.data };
}

function SectionCard({ title, aside, icon, children }) {
  return <section className="policy-detail-card">
    <div className="policy-detail-card-heading">
      <h2>{icon && <span className="policy-detail-sparkle" aria-hidden="true">✦</span>}{title}</h2>
      {aside && <span className="policy-detail-aside">{aside}</span>}
    </div>
    {children}
  </section>;
}

function OfficialEmpty({ text, url }) {
  return <div className="policy-detail-empty"><p>{text}</p>{url && <a href={url} target="_blank" rel="noreferrer">공식 공고 확인하기 ›</a>}</div>;
}

export default function PolicyDetailPage() {
  const { policyId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState('');

  const policy = useQuery({ queryKey: ['policy', user?.id, policyId],
    queryFn: () => fetchPolicy(policyId), enabled: !!user, staleTime: 0 });
  const eligibility = useQuery({ queryKey: ['eligibility', user?.id ?? null, policyId], queryFn: () => fetchEligibility(policyId), enabled: !!user });
  const explanation = useQuery({ queryKey: ['policy-explanation', user?.id, policyId, eligibility.dataUpdatedAt],
    queryFn: () => fetchPolicyExplanation(policyId), enabled: !!user && !!policy.data && !!eligibility.data,
    staleTime: 10 * 60 * 1000, retry: false });
  const similar = useQuery({ queryKey: ['similar-policies', user?.id, policyId],
    queryFn: () => fetchSimilarPolicies(policyId), enabled: !!user && !!policy.data });
  const detailState = useQuery({
    queryKey: ['policy-detail-state', user?.id, policyId],
    queryFn: () => fetchDetailState(user.id, policyId), enabled: !!user,
  });
  useEffect(() => {
    if (user?.id && policy.data?.policy_id === policyId) {
      recordPolicyView(policyId).catch(() => {});
    }
  }, [user?.id, policy.data?.policy_id, policyId]);

  const bookmarkMutation = useMutation({
    mutationFn: ({ saved }) => saved ? removeBookmark(policyId) : addBookmark(policyId, 'DETAIL'),
    onSuccess: (_result, { saved }) => {
      setActionError('');
      queryClient.setQueryData(['policy', user?.id, policyId], (current) =>
        current ? { ...current, is_bookmarked: !saved } : current);
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['policy', user?.id, policyId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: () => setActionError('관심 정책을 저장하지 못했어요.'),
  });
  const documentMutation = useMutation({
    mutationFn: async ({ key, checked }) => {
      const { error } = await supabase.from('user_document_check').upsert({
        user_id: user.id, policy_id: policyId, doc_key: key, is_checked: checked,
        checked_at: checked ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,policy_id,doc_key' });
      if (error) throw error;
    },
    onSuccess: () => { setActionError(''); queryClient.invalidateQueries({ queryKey: ['policy-detail-state', user?.id, policyId] }); },
    onError: () => setActionError('준비물 상태를 저장하지 못했어요.'),
  });
  const applicationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('user_application').upsert({
        user_id: user.id, policy_id: policyId, added_from: 'DETAIL',
      }, { onConflict: 'user_id,policy_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => { setActionError(''); queryClient.invalidateQueries({ queryKey: ['policy-detail-state', user?.id, policyId] }); },
    onError: () => setActionError('신청 관리에 추가하지 못했어요.'),
  });

  if (!user) return <div className="policy-detail-page">
    <StateMessage isEmpty emptyText="정책 상세를 보려면 로그인이 필요해요." />
    {import.meta.env.DEV && <button className="policy-detail-dev-login" onClick={() => navigate('/dev/login')}>테스트 계정으로 로그인</button>}
  </div>;
  if (!policy.data) return <div className="policy-detail-page"><StateMessage isLoading={policy.isLoading} error={policy.error} /></div>;
  const p = policy.data;
  const saved = Boolean(p.is_bookmarked);
  const applicationUrl = externalUrl(p.application_url);
  const originalLinkUrl = externalUrl(p.original_link_url);
  const sourceUrl = externalUrl(p.official_url) || originalLinkUrl || externalUrl(p.source_url);
  const url = applicationUrl || sourceUrl;
  const applicationMethod = originalLinkUrl
    ? p.application_method?.replace(/,?\s*원문\s*URL\s*링크\s*\[?https?:\/\/\S*$/iu, '').trim()
    : p.application_method;
  const category = p.category_name ?? '정책';
  const eligibilityTag = user ? eligibilityTags[eligibility.data?.result] : null;
  const docs = documentsFor(p);
  const steps = asArray(p.application_process).filter((item) => typeof item === 'string' && item.trim());
  const checks = new Set(detailState.data?.checks?.filter((item) => item.is_checked).map((item) => item.doc_key) ?? []);
  const conditions = eligibility.data?.conditions ?? [];
  const shownConditions = expanded ? conditions : conditions.slice(0, 3);
  const related = similar.data?.items ?? [];
  const isManaged = Boolean(detailState.data?.application);
  const deadline = dDayText(p.d_day, p.recruitment_status);
  const supportSummary = p.support_summary?.trim();
  const unknownPeriodReason = periodText(p) === '기간 미정' && p.recruitment_status === '기간 미정'
    ? p.application_period_unknown_reason?.trim() : null;
  const additionalChecks = conditions.filter((item) => item.status === 'UNKNOWN');

  return <div className="policy-detail-page">
    <header className="policy-detail-header">
      <button className="policy-detail-back" onClick={() => navigate(-1)} aria-label="뒤로 가기"><BackIcon /></button>
      <h1>정책 상세</h1>
      <button className={`policy-detail-save${saved ? ' is-saved' : ''}`}
        onClick={() => user ? bookmarkMutation.mutate({ saved }) : navigate('/my')}
        disabled={bookmarkMutation.isPending} aria-label={`${p.title} 관심 정책 ${saved ? '해제' : '저장'}`} aria-pressed={saved}>
        <HeartIcon />
      </button>
    </header>
    <main className="policy-detail-content">
      <section className="policy-detail-hero">
        <div className="policy-detail-tags search-policy-tags">
          <span className={`search-policy-tag--${(eligibilityTag ?? eligibilityTags.CHECK).tone}`}>{(eligibilityTag ?? eligibilityTags.CHECK).text}</span>
          <span className={`search-policy-tag--${categoryTagTone[category] ?? 'blue'}`}>{category}</span>
          <span className="search-policy-tag--region">{regionText(p.regions)}</span>
        </div>
        <h2>{p.title}</h2>
        {supportSummary && <p className="policy-detail-description">{supportSummary}</p>}
        <div className="policy-detail-period"><div><span>신청기간</span><strong>{periodText(p)}</strong>{unknownPeriodReason && <p className="policy-detail-period-reason">{unknownPeriodReason}</p>}<span>모집 상태: {p.recruitment_status ?? '기간 미정'}</span></div><b className={deadline?.startsWith('D-') ? 'urgent' : ''}>{deadline || '확인 필요'}</b></div>
      </section>

      <div className="policy-detail-sections">
        <SectionCard title="정책 요약">
          <dl className="policy-detail-summary">
            <div><dt>신청 대상</dt><dd>{p.summary?.target || p.target_summary || '공식 공고 확인 필요'}</dd></div>
            <div><dt>지원 내용</dt><dd>{p.support_content || '공식 공고 확인 필요'}</dd></div>
            <div><dt>신청방법</dt><dd>{applicationMethod || (sourceUrl ? '공식 공고에서 확인' : '공식 공고 확인 필요')}</dd></div>
          </dl>
        </SectionCard>

        <SectionCard title="Dr.부의 한마디" icon>
          {eligibility.isLoading || explanation.isLoading ? <p className="policy-detail-ai-placeholder">정책 설명을 정리하고 있어요.</p>
            : explanation.isError || explanation.data?.status !== 'ok'
              ? <p className="policy-detail-ai-placeholder" role="status">AI 설명을 불러오지 못했어요. 아래의 정책 요약과 자격 판정을 확인해 주세요.</p>
              : <div className="policy-detail-ai-placeholder">
                <p>{explanation.data.explanation.summary}</p>
                {explanation.data.explanation.benefits.length > 0 && <p>주요 혜택: {explanation.data.explanation.benefits.join(' · ')}</p>}
                <p>{explanation.data.explanation.eligibility_explanation}</p>
                <p>{explanation.data.explanation.recommendation_reason}</p>
                {explanation.data.explanation.additional_checks.length > 0 && <p>추가 확인: {explanation.data.explanation.additional_checks.join(' · ')}</p>}
              </div>}
        </SectionCard>

        <SectionCard title="내 조건과 비교하기" aside={eligibility.data ? verdicts[eligibility.data.result] : '확인 필요'}>
          {!user ? <p className="policy-detail-muted">로그인하면 내 조건과 정책의 신청 자격을 비교할 수 있어요.</p>
            : eligibility.isLoading ? <p className="policy-detail-muted">조건을 확인하고 있어요.</p>
              : eligibility.error ? <p className="policy-detail-muted">조건 비교를 불러오지 못했어요.</p>
                : conditions.length ? <>
                  <p className="policy-detail-muted">{eligibility.data.reason}</p>
                  <div className="policy-detail-conditions">{shownConditions.map((item, index) => <div className="policy-detail-condition" key={`${conditionName(item)}-${index}`}>
                    <div className="policy-detail-condition-row"><span>{conditionName(item)}</span><b className={`status-${item.status?.toLowerCase()}`}>{itemVerdicts[item.status] ?? '확인 필요'}</b></div>
                    <p><strong>정책 조건</strong> {policyCondition(item)}</p>
                    <p><strong>내 조건</strong> {userCondition(item)}</p>
                    <p><strong>판정 근거</strong> {item.reason}</p>
                    {externalUrl(item.evidence?.source_url) && <a href={externalUrl(item.evidence.source_url)} target="_blank" rel="noopener noreferrer">조건 원문 확인 ↗</a>}
                  </div>)}</div>
                  {conditions.length > 3 && <button className="policy-detail-more" onClick={() => setExpanded((value) => !value)}>{expanded ? '조건 접기' : `${conditions.length - 3}개의 조건 더보기 ›`}</button>}
                  {additionalChecks.length > 0 && <p className="policy-detail-muted">추가 확인: {additionalChecks.map(policyCondition).join(' · ')}</p>}
                </> : <p className="policy-detail-muted">공식 공고의 자격 조건을 확인해주세요.</p>}
        </SectionCard>

        <SectionCard title="신청 절차">
          {steps.length ? <ol className="policy-detail-steps">{steps.map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
            : <OfficialEmpty text="공식 자료에서 세부 신청 절차를 확인해주세요." url={sourceUrl || applicationUrl} />}
        </SectionCard>

        <SectionCard title="신청 준비물" aside={docs.length && detailState.isSuccess ? `${checks.size}/${docs.length} 준비` : null}>
          {docs.length ? <div className="policy-detail-documents">{docs.map((document) => <button key={document.key} className={checks.has(document.key) ? 'checked' : ''}
            onClick={() => user ? documentMutation.mutate({ key: document.key, checked: !checks.has(document.key) }) : navigate('/my')}
            disabled={documentMutation.isPending || (user && (detailState.isLoading || detailState.isError))} aria-pressed={checks.has(document.key)}>
            <span className="policy-detail-check">✓</span><span>{document.name}</span>
          </button>)}</div> : <OfficialEmpty text="공식 자료에서 제출서류를 확인할 수 없어요." url={sourceUrl || applicationUrl} />}
          {detailState.isError && <p className="policy-detail-muted">준비물 체크 상태를 불러오지 못했어요.</p>}
        </SectionCard>

        <SectionCard title="정책 비교">
          <p className="policy-detail-muted">다른 정책과 조건과 혜택을 비교해보세요.</p>
          <button className="policy-detail-compare" onClick={() => navigate(`/policies/${policyId}/compare/select`)}><span aria-hidden="true">⇄</span> 다른 정책과 비교하기</button>
        </SectionCard>

        <SectionCard title="이런 정책도 있어요">{related.length > 0
          ? <div className="policy-detail-related">{related.map((item) => <button key={item.policy_id} onClick={() => { navigate(`/policies/${item.policy_id}`); window.scrollTo(0, 0); }}><div><span>{item.category_name ?? '정책'}</span><strong>{item.title}</strong><small>{item.benefit || '정책 내용을 확인해보세요.'}</small></div><span aria-hidden="true">↗</span></button>)}</div>
          : <p className="policy-detail-muted">{similar.isLoading ? '비슷한 정책을 찾고 있어요.' : similar.isError ? '추천 정책을 불러오지 못했어요.' : '비슷한 정책이 아직 없어요.'}</p>}
        </SectionCard>
      </div>
    </main>

    {actionError && <p className="policy-detail-action-error" role="alert">{actionError}</p>}
    <div className="policy-detail-actions">
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">{applicationUrl ? '신청 페이지 바로가기 ↗' : '원문 바로가기 ↗'}</a>
        : <span className="policy-detail-unavailable">공식 신청 페이지 확인 필요</span>}
      <button onClick={() => user ? applicationMutation.mutate() : navigate('/my')}
        disabled={isManaged || applicationMutation.isPending || detailState.isLoading || detailState.isError}>
        {isManaged ? '✓ 신청 관리에 추가됨' : '＋ 신청 관리에 추가'}
      </button>
    </div>

  </div>;
}
