import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEligibility, fetchPolicy, fetchPolicyExplanation, fetchPolicyFollowup, fetchSimilarPolicies, recordPolicyView } from '../../api/policies';
import { addBookmark, removeBookmark } from '../../api/me';
import { BOOKMARK_TOAST, BOOKMARK_TOAST_MS, UNBOOKMARK_TOAST, useToastStore } from '../../store/toastStore';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { dDayText } from '../../utils/format';
import StateMessage from '../../components/StateMessage.jsx';
import { BackIcon, HeartIcon } from '../../components/icons.jsx';
import { displayConditions } from './eligibilityDisplay.js';
import './PolicyDetailPage.css';

const verdicts = { ELIGIBLE: '신청 가능', CHECK: '확인 필요', INELIGIBLE: '대상 아님' };
const eligibilityTags = {
  ELIGIBLE: { text: '✓ 신청 가능', tone: 'eligible' },
  CHECK: { text: '! 확인 필요', tone: 'check' },
  INELIGIBLE: { text: '× 대상 아님', tone: 'ineligible' },
};
const categoryTagTone = {
  '주거·생활': 'blue', '취업·진로': 'pink', '장학·금융': 'purple',
  문화: 'green', '문화·예술': 'green', '복지·건강': 'purple',
};
const itemVerdicts = { SATISFIED: '충족', UNSATISFIED: '불충족', UNKNOWN: '확인 필요', NOT_APPLICABLE: '해당 없음' };
const exclusionVerdicts = { HIT: '제외 대상', CLEAR: '해당 없음', UNKNOWN: '확인 필요' };
const conditionNames = {
  age: '나이 조건', birth_date: '생년월일', region: '거주 지역', region_code: '거주 지역', residence_months: '거주 기간',
  city_code: '거주 지역', all_members_homeless: '세대원 무주택',
  rental_contract_signed: '임대차계약 체결', deposit_paid_ratio: '계약금 납부 비율',
  annual_income: '연 소득', is_married: '혼인 여부', marriage_duration: '혼인 기간',
  will_marry_within_three_months: '3개월 이내 혼인 예정',
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

function ConditionRows({ items, exclusion = false }) {
  return <div className="policy-detail-conditions">{items.map((item, index) => {
    if (item.children?.length) return <div className="policy-detail-condition-group" key={`${item.label}-${index}`}>
      <div className="policy-detail-condition-group-heading"><span>{item.label}</span>
        <b className={`status-${item.status?.toLowerCase()}`}>
          {(exclusion ? exclusionVerdicts : itemVerdicts)[item.status] ?? '확인 필요'}
        </b>
      </div>
      <p className="policy-detail-condition-group-help">{item.label === '아래 조건을 모두 충족' ? '아래 항목을 모두 확인해 주세요.' : '아래 항목 중 하나를 충족해야 해요.'}</p>
      {item.label === '아래 조건을 모두 충족'
        ? <ConditionRows items={item.children} exclusion={exclusion} />
        : <div className="policy-detail-condition-options">{item.children.map((child, childIndex) =>
          <div className="policy-detail-condition-option" key={`${child.label}-${childIndex}`}>
            <ConditionRows items={[child]} exclusion={exclusion} />
          </div>)}</div>}
    </div>;
    return <div className={`policy-detail-condition-row${item.label === '다음 중 하나에 해당' ? ' policy-detail-condition-alternative' : ''}`} key={`${item.label}-${index}`}>
      <span>{item.label}{item.profileComparison && <small className="policy-detail-profile-basis">입력 정보 기준</small>}</span><b className={`status-${item.status?.toLowerCase()}`}>
        {(exclusion ? exclusionVerdicts : itemVerdicts)[item.status] ?? '확인 필요'}
      </b>
    </div>;
  })}</div>;
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
  const showToast = useToastStore((state) => state.show);
  const [actionError, setActionError] = useState('');
  const [aiMore, setAiMore] = useState(null);

  const policy = useQuery({ queryKey: ['policy', user?.id, policyId],
    queryFn: () => fetchPolicy(policyId), enabled: !!user, staleTime: 0 });
  const eligibility = useQuery({ queryKey: ['eligibility', user?.id ?? null, policyId], queryFn: () => fetchEligibility(policyId), enabled: !!user });
  // Dr.부 추가 질문: 서버 AI가 답하고, 실패하면 서버가 정책 데이터로 만든 답을 준다.
  const canExplainReason = !!user && eligibility.isSuccess && !eligibility.isFetching;
  const followup = useQuery({ queryKey: ['policy-followup', user?.id, policyId, aiMore, eligibility.dataUpdatedAt],
    queryFn: () => fetchPolicyFollowup(policyId, aiMore), enabled: !!user && !!aiMore && canExplainReason,
    staleTime: 5 * 60 * 1000, retry: false });
  const explanation = useQuery({ queryKey: ['policy-explanation', user?.id, policyId, eligibility.dataUpdatedAt],
    queryFn: () => fetchPolicyExplanation(policyId), enabled: !!user && !!policy.data && eligibility.isSuccess && !eligibility.isFetching,
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
      if (saved) showToast(UNBOOKMARK_TOAST);
      else showToast(BOOKMARK_TOAST, { duration: BOOKMARK_TOAST_MS });
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
  </div>;
  if (!policy.data) return <div className="policy-detail-page"><StateMessage isLoading={policy.isLoading} error={policy.error} /></div>;
  const p = policy.data;
  const saved = Boolean(p.is_bookmarked);
  const applicationUrl = externalUrl(p.application_url);
  const originalLinkUrl = externalUrl(p.original_link_url);
  const sourceUrl = externalUrl(p.official_url) || originalLinkUrl || externalUrl(p.source_url);
  // 희망저축계좌 Ⅰ·Ⅱ는 맨 아래 버튼을 신청 페이지 대신 원문(공식 공고)으로 연결한다.
  const originalOnly = /^희망저축계좌/u.test(p.title ?? '') && !!sourceUrl;
  const url = originalOnly ? sourceUrl : applicationUrl || sourceUrl;
  const applicationMethod = originalLinkUrl
    ? p.application_method?.replace(/,?\s*원문\s*URL\s*링크\s*\[?https?:\/\/\S*$/iu, '').trim()
    : p.application_method;
  const category = p.category_name ?? '정책';
  const eligibilityTag = eligibility.isSuccess && !eligibility.isFetching
    ? eligibilityTags[eligibility.data?.result] : null;
  const docs = documentsFor(p);
  const steps = asArray(p.application_process).filter((item) => typeof item === 'string' && item.trim());
  const checks = new Set(detailState.data?.checks?.filter((item) => item.is_checked).map((item) => item.doc_key) ?? []);
  const conditions = eligibility.data?.conditions ?? [];
  const { required: requiredConditions, exclusions: excludedConditions } = displayConditions(conditions, p.title);
  const related = similar.data?.items ?? [];
  const isManaged = Boolean(detailState.data?.application);
  const deadline = dDayText(p.d_day, p.recruitment_status);
  const supportSummary = p.support_summary?.trim();
  const unknownPeriodReason = periodText(p) === '기간 미정' && p.recruitment_status === '기간 미정'
    ? p.application_period_unknown_reason?.trim() : null;
  const missingProfileFields = eligibility.data?.missing_profile_fields ?? [];
  const eligibilityError = eligibility.error?.code === 'POLICY_LOOKUP_FAILED'
    ? '정책 신청 자격을 불러오지 못했어요.'
    : eligibility.error?.code === 'PROFILE_LOOKUP_FAILED'
      ? '내 정보를 불러오지 못했어요.' : '조건 비교를 불러오지 못했어요.';

  const toggleMore = (key) => setAiMore((current) => current === key ? null : key);

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
          {eligibilityTag && <span className={`search-policy-tag--${eligibilityTag.tone}`}>{eligibilityTag.text}</span>}
          <span className={`search-policy-tag--${categoryTagTone[category] ?? 'blue'}`}>{category}</span>
          <span className="search-policy-tag--region">{regionText(p.regions)}</span>
        </div>
        <h2>{p.title}</h2>
        {supportSummary && <p className="policy-detail-description">{supportSummary}</p>}
        <div className="policy-detail-period"><div><span>신청기간</span><strong>{periodText(p)}</strong>{unknownPeriodReason && <p className="policy-detail-period-reason">{unknownPeriodReason}</p>}<span>모집 상태: {p.recruitment_status ?? '기간 미정'}</span></div><b className={p.d_day != null && p.d_day >= 0 && p.d_day <= 7 && p.recruitment_status !== '상시' ? 'urgent' : ''}>{deadline || '확인 필요'}</b></div>
      </section>

      <div className="policy-detail-sections">
        <SectionCard title="정책 요약">
          <dl className="policy-detail-summary">
            <div><dt>신청 대상</dt><dd>{p.summary?.target || p.target_summary || '공식 공고 확인 필요'}</dd></div>
            <div><dt>지원 내용</dt><dd>{p.support_content || '공식 공고 확인 필요'}</dd></div>
            <div><dt>신청방법</dt><dd>{applicationMethod || (sourceUrl ? '공식 공고에서 확인' : '공식 공고 확인 필요')}</dd></div>
          </dl>
          {/* NFR-SRCH-003: 출처와 최종 확인일. 확인일이 없으면 날짜를 만들지 않는다 */}
          <p className="policy-detail-muted policy-detail-source-note">
            {sourceUrl ? <>출처: <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{p.source_name || '공식 원문'}</a></> : '출처: 공식 출처 확인 필요'}
            {' · '}
            {(p.last_verified_at || p.source_checked_at) ? `최종 확인일 ${String(p.last_verified_at || p.source_checked_at).slice(0, 10).replaceAll('-', '.')}` : '최종 확인일 정보 없음'}
          </p>
        </SectionCard>

        {/* 장소가 있는 정책(공간·시설 등): 지도 탭에서 그 장소 카드를 연다 (지도 ?place= 진입, FR-MAP-028) */}
        {p.place && <SectionCard title="위치">
          <div className="policy-detail-place">
            <strong>{p.place.name}</strong>
            {p.place.address && <p>{p.place.address}</p>}
          </div>
          <button type="button" className="policy-detail-compare policy-detail-map-link"
            onClick={() => navigate(`/map?place=${encodeURIComponent(p.place.place_id)}`)}>
            <span aria-hidden="true">📍</span> 지도에서 보기 →
          </button>
        </SectionCard>}

        <SectionCard title="Dr.부의 한마디" icon>
          {eligibility.isError ? <p className="policy-detail-ai-placeholder">조건 비교를 불러오지 못해 자격 설명을 표시할 수 없어요.</p>
            : eligibility.isFetching || explanation.isLoading ? <p className="policy-detail-ai-placeholder">정책 설명을 정리하고 있어요.</p>
            : explanation.isError || !explanation.data?.explanation?.summary
              ? <p className="policy-detail-ai-placeholder" role="status">기본 정보 기반 안내예요. AI 설명을 불러오지 못해 정책 요약과 자격 판정만 보여드려요.</p>
              : <p className="policy-detail-ai-placeholder">{explanation.data.explanation.summary}</p>}
          {!eligibility.isFetching && !explanation.isLoading && <div className="policy-detail-ai-chips">
            {canExplainReason && <button type="button" className={aiMore === 'detail' ? 'is-active' : ''} aria-pressed={aiMore === 'detail'}
              onClick={() => toggleMore('detail')}>더 자세히 알려주세요</button>}
            {canExplainReason && <button type="button" className={aiMore === 'reason' ? 'is-active' : ''} aria-pressed={aiMore === 'reason'}
              onClick={() => toggleMore('reason')}>확인이 필요한 이유가 궁금해요</button>}
          </div>}
          {aiMore && <div className="policy-detail-ai-more" role="status" aria-live="polite">
            {followup.isLoading ? <p>닥터부가 답변을 정리하고 있어요.</p>
              : followup.isError ? <p>답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
                : <p>{followup.data?.answer}</p>}
          </div>}
        </SectionCard>

        <SectionCard title="내 조건과 비교하기" aside={eligibility.isSuccess && !eligibility.isFetching ? verdicts[eligibility.data.result] : null}>
          {!user ? <p className="policy-detail-muted">로그인하면 내 조건과 정책의 신청 자격을 비교할 수 있어요.</p>
            : eligibility.isFetching ? <p className="policy-detail-muted">조건을 확인하고 있어요.</p>
              : eligibility.error ? <div className="policy-detail-muted" role="alert">{eligibilityError} 잠시 후 다시 시도해 주세요.
                <button type="button" className="policy-detail-more" onClick={() => eligibility.refetch()}>다시 시도</button></div>
                : conditions.length ? <>
                  {p.eligibility_verified !== false && eligibility.data.result !== 'ELIGIBLE' && <p className="policy-detail-muted">{eligibility.data.reason}</p>}
                  {requiredConditions.length > 0 && <div className="policy-detail-condition-section">
                    <h3>신청 자격</h3><ConditionRows items={requiredConditions} />
                  </div>}
                  {excludedConditions.length > 0 && <div className="policy-detail-condition-section">
                    <h3>신청 제외 사항</h3><ConditionRows items={excludedConditions} exclusion />
                  </div>}
                  {(eligibility.data.profile_missing || missingProfileFields.length > 0) && <p className="policy-detail-muted">내 정보에서 {missingProfileFields.map((field) => conditionNames[field] ?? '필요한 정보').join(' · ') || '프로필'}을 입력하거나 수정해 주세요. <button type="button" className="policy-detail-more" onClick={() => navigate('/my#profile')}>내 정보 수정 ›</button></p>}
                </> : <div className="policy-detail-muted">{eligibility.data?.reason ?? '신청 자격 정보가 없습니다.'}</div>}
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
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">{applicationUrl && !originalOnly ? '신청 페이지 바로가기 ↗' : '원문 바로가기 ↗'}</a>
        : <span className="policy-detail-unavailable">공식 출처 확인 필요</span>}
      <button onClick={() => user ? applicationMutation.mutate() : navigate('/my')}
        disabled={isManaged || applicationMutation.isPending || detailState.isLoading || detailState.isError}>
        {isManaged ? '✓ 신청 관리에 추가됨' : '＋ 신청 관리에 추가'}
      </button>
    </div>

  </div>;
}
