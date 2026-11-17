import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEligibility, fetchPolicies, fetchPolicy } from '../../api/policies';
import { addBookmark, fetchBookmarks, removeBookmark } from '../../api/me';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { dDayText } from '../../utils/format';
import StateMessage from '../../components/StateMessage.jsx';
import { BackIcon, HeartIcon } from '../../components/icons.jsx';
import './PolicyDetailPage.css';

const verdicts = { ELIGIBLE: '신청 가능', CHECK: '확인 필요', INELIGIBLE: '신청 불가' };
const itemVerdicts = { SATISFIED: '신청 가능', UNSATISFIED: '신청 불가', UNKNOWN: '확인 필요' };
const conditionNames = {
  age: '나이 조건', region: '거주 지역', residence_months: '거주 기간',
  final_education: '학력', current_status: '현재 상태', housing_type: '주거 형태',
  household_type: '가구 형태', marital_status: '혼인 여부', special_targets: '특별 대상',
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
  if (item.text) return item.text;
  if (item.any) return item.any.map(conditionName).join(' 또는 ');
  return conditionNames[item.field] ?? '신청 조건';
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
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState('');
  const [actionError, setActionError] = useState('');

  const policy = useQuery({ queryKey: ['policy', policyId], queryFn: () => fetchPolicy(policyId) });
  const eligibility = useQuery({ queryKey: ['eligibility', policyId], queryFn: () => fetchEligibility(policyId), enabled: !!user });
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: fetchBookmarks, enabled: !!user });
  const detailState = useQuery({
    queryKey: ['policy-detail-state', user?.id, policyId],
    queryFn: () => fetchDetailState(user.id, policyId), enabled: !!user,
  });
  const alternatives = useQuery({
    queryKey: ['policy-compare-options', policy.data?.category_id],
    queryFn: () => fetchPolicies({ categoryId: policy.data.category_id, sort: 'recommended', size: 30 }),
    enabled: compareOpen && !!policy.data?.category_id,
  });
  const compared = useQuery({ queryKey: ['policy', compareId], queryFn: () => fetchPolicy(compareId), enabled: !!compareId });
  const saved = bookmarks.data?.some((item) => item.policy?.policy_id === policyId) ?? false;
  const bookmarkMutation = useMutation({
    mutationFn: () => saved ? removeBookmark(policyId) : addBookmark(policyId, 'DETAIL'),
    onSuccess: () => { setActionError(''); queryClient.invalidateQueries({ queryKey: ['bookmarks'] }); },
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

  if (!policy.data) return <div className="policy-detail-page"><StateMessage isLoading={policy.isLoading} error={policy.error} /></div>;
  const p = policy.data;
  const applicationUrl = externalUrl(p.application_url);
  const originalLinkUrl = externalUrl(p.original_link_url);
  const originalUrl = originalLinkUrl || externalUrl(p.official_url);
  const sourceUrl = originalUrl || externalUrl(p.source_url);
  const url = originalLinkUrl || applicationUrl || sourceUrl;
  const applicationMethod = originalLinkUrl
    ? p.application_method?.replace(/,?\s*원문\s*URL\s*링크\s*\[?https?:\/\/\S*$/iu, '').trim()
    : p.application_method;
  const category = p.category_name ?? '정책';
  const docs = documentsFor(p);
  const steps = asArray(p.application_process).filter((item) => typeof item === 'string' && item.trim());
  const checks = new Set(detailState.data?.checks?.filter((item) => item.is_checked).map((item) => item.doc_key) ?? []);
  const conditions = eligibility.data?.conditions ?? [];
  const shownConditions = expanded ? conditions : conditions.slice(0, 3);
  const related = p.related_policies ?? [];
  const isManaged = Boolean(detailState.data?.application);
  const deadline = dDayText(p.d_day, p.recruitment_status);
  const checkedAt = p.source_checked_at && new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(new Date(p.source_checked_at));

  return <div className="policy-detail-page">
    <header className="policy-detail-header">
      <button className="policy-detail-back" onClick={() => navigate(-1)} aria-label="뒤로 가기"><BackIcon /></button>
      <h1>정책 상세</h1>
      <button className={`policy-detail-save${saved ? ' is-saved' : ''}`}
        onClick={() => user ? bookmarkMutation.mutate() : navigate('/my')}
        disabled={bookmarkMutation.isPending} aria-label={`${p.title} 관심 정책 ${saved ? '해제' : '저장'}`} aria-pressed={saved}>
        <HeartIcon />
      </button>
    </header>
    <main className="policy-detail-content">
      <section className="policy-detail-hero">
        <div className="policy-detail-tags"><span>{category}</span><span>{regionText(p.regions)}</span>{p.target_summary && <span>{p.target_summary.length > 28 ? `${p.target_summary.slice(0, 28)}…` : p.target_summary}</span>}</div>
        <h2>{p.title}</h2>
        <p className="policy-detail-description">{p.support_content || p.target_summary || '공식 공고에서 자세한 내용을 확인해주세요.'}</p>
        <div className="policy-detail-period"><div><span>신청기간</span><strong>{periodText(p)}</strong></div><b className={deadline?.startsWith('D-') ? 'urgent' : ''}>{deadline || '확인 필요'}</b></div>
      </section>

      <div className="policy-detail-sections">
        <SectionCard title="정책 요약">
          <dl className="policy-detail-summary">
            <div><dt>누가 받을 수 있나요</dt><dd>{p.target_summary || '공식 공고 확인 필요'}</dd></div>
            <div><dt>신청기간</dt><dd>{periodText(p)}</dd></div>
            <div><dt>신청방법</dt><dd>{applicationMethod || (originalLinkUrl ? '원문 링크에서 확인' : '공식 공고 확인 필요')}</dd></div>
            {originalUrl && <div><dt>원문URL</dt><dd><a className="policy-detail-source-link" href={originalUrl} target="_blank" rel="noopener noreferrer">원문 바로가기 ↗</a></dd></div>}
            {p.collection_domain === 'CULTURE' && p.item_type === 'POLICY' && checkedAt &&
              <div><dt>최종 확인일</dt><dd>{checkedAt}</dd></div>}
          </dl>
        </SectionCard>

        <SectionCard title="AI 비서의 한마디" icon>
          <p className="policy-detail-ai-placeholder">주요 혜택과 추천 이유, 추가로 확인할 조건을 AI 비서가 정리해 드릴 예정이에요.</p>
        </SectionCard>

        <SectionCard title="내 조건과 비교하기" aside={eligibility.data ? verdicts[eligibility.data.result] : '확인 필요'}>
          {!user ? <p className="policy-detail-muted">로그인하면 내 조건과 정책의 신청 자격을 비교할 수 있어요.</p>
            : eligibility.isLoading ? <p className="policy-detail-muted">조건을 확인하고 있어요.</p>
              : eligibility.error ? <p className="policy-detail-muted">조건 비교를 불러오지 못했어요.</p>
                : conditions.length ? <>
                  <div className="policy-detail-conditions">{shownConditions.map((item, index) => <div key={`${conditionName(item)}-${index}`}><span>{conditionName(item)}</span><b className={`status-${item.status?.toLowerCase()}`}>{itemVerdicts[item.status] ?? '확인 필요'}</b></div>)}</div>
                  {conditions.length > 3 && <button className="policy-detail-more" onClick={() => setExpanded((value) => !value)}>{expanded ? '조건 접기' : `${conditions.length - 3}개의 조건 더보기 ›`}</button>}
                </> : <p className="policy-detail-muted">공식 공고의 자격 조건을 확인해주세요.</p>}
        </SectionCard>

        <SectionCard title="신청 절차">
          {steps.length ? <ol className="policy-detail-steps">{steps.map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
            : <OfficialEmpty text="공식 자료에서 세부 신청 절차를 확인해주세요." url={sourceUrl || applicationUrl} />}
        </SectionCard>

        <SectionCard title="신청 준비물" aside={docs.length ? `${checks.size}/${docs.length} 준비` : null}>
          {docs.length ? <div className="policy-detail-documents">{docs.map((document) => <button key={document.key} className={checks.has(document.key) ? 'checked' : ''}
            onClick={() => user ? documentMutation.mutate({ key: document.key, checked: !checks.has(document.key) }) : navigate('/my')}
            disabled={documentMutation.isPending || (user && detailState.isLoading)} aria-pressed={checks.has(document.key)}>
            <span className="policy-detail-check">✓</span><span>{document.name}</span>
          </button>)}</div> : <OfficialEmpty text="공식 자료에서 제출서류를 확인할 수 없어요." url={sourceUrl || applicationUrl} />}
        </SectionCard>

        <SectionCard title="정책 비교">
          <p className="policy-detail-muted">다른 정책과 조건과 혜택을 비교해보세요.</p>
          <button className="policy-detail-compare" onClick={() => setCompareOpen(true)}><span aria-hidden="true">⇄</span> 다른 정책과 비교하기</button>
        </SectionCard>

        {related.length > 0 && <SectionCard title="이런 정책도 있어요"><div className="policy-detail-related">{related.map((item) => <button key={item.policy_id} onClick={() => { navigate(`/policies/${item.policy_id}`); window.scrollTo(0, 0); }}><div><span>{category}</span><strong>{item.title}</strong><small>{item.support_content || item.target_summary || '정책 내용을 확인해보세요.'}</small></div><span aria-hidden="true">↗</span></button>)}</div></SectionCard>}
      </div>
    </main>

    {actionError && <p className="policy-detail-action-error" role="alert">{actionError}</p>}
    <div className="policy-detail-actions">
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">{originalLinkUrl || !applicationUrl ? '원문 바로가기 ↗' : '신청 페이지 바로가기 ↗'}</a>
        : <span className="policy-detail-unavailable">공식 신청 페이지 확인 필요</span>}
      <button onClick={() => user ? applicationMutation.mutate() : navigate('/my')}
        disabled={isManaged || applicationMutation.isPending || (user && detailState.isLoading)}>
        {isManaged ? '✓ 신청 관리에 추가됨' : '＋ 신청 관리에 추가'}
      </button>
    </div>

    {compareOpen && <div className="policy-detail-dialog-backdrop" onClick={() => { setCompareOpen(false); setCompareId(''); }}>
      <div className="policy-detail-dialog" role="dialog" aria-modal="true" aria-label="정책 비교" onClick={(event) => event.stopPropagation()}>
        <div className="policy-detail-dialog-header"><h2>다른 정책과 비교하기</h2><button onClick={() => { setCompareOpen(false); setCompareId(''); }} aria-label="닫기">×</button></div>
        <p>비교할 정책을 선택해주세요.</p>
        {alternatives.isLoading && <p>정책을 불러오고 있어요.</p>}
        {alternatives.error && <p>정책을 불러오지 못했어요.</p>}
        <div className="policy-detail-dialog-list">{alternatives.data?.items?.filter((item) => item.policy_id !== policyId).map((item) => <button key={item.policy_id} className={compareId === item.policy_id ? 'selected' : ''} onClick={() => setCompareId(item.policy_id)}>{item.title}<span>{compareId === item.policy_id ? '선택됨' : '선택 ›'}</span></button>)}</div>
        {compareId && compared.data && <div className="policy-detail-comparison"><h3>정책 비교</h3><div className="policy-detail-comparison-grid"><strong>{p.title}</strong><strong>{compared.data.title}</strong><span>{p.target_summary || '대상 확인 필요'}</span><span>{compared.data.target_summary || '대상 확인 필요'}</span><span>{periodText(p)}</span><span>{periodText(compared.data)}</span><span>{p.support_content || '혜택 확인 필요'}</span><span>{compared.data.support_content || '혜택 확인 필요'}</span></div></div>}
      </div>
    </div>}
  </div>;
}
