import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAiCompareCandidates, fetchAiComparisonSummary, fetchPolicies, fetchPolicy,
  fetchPolicyComparison, fetchSearchFilters, fetchSimilarPolicies } from '../../api/policies';
import { BackIcon, SearchIcon } from '../../components/icons.jsx';
import PolicyAutocomplete from '../../components/PolicyAutocomplete.jsx';
import StateMessage from '../../components/StateMessage.jsx';
import { useAuthStore } from '../../store/authStore';
import './PolicyComparePage.css';

const verdictText = { ELIGIBLE: '✓ 신청 가능', CHECK: '! 확인 필요', INELIGIBLE: '× 대상 아님' };

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { return asArray(JSON.parse(value)); } catch { return []; }
}

function dateText(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${Number(match[2])}.${Number(match[3])}` : '';
}

function periodText(policy) {
  if (policy.is_always_open) return '상시';
  const start = dateText(policy.application_start_date);
  const end = dateText(policy.application_end_date);
  return start || end ? `${start || '시작일 미정'} ~ ${end || '종료일 미정'}` : '기간 확인 필요';
}

function ageText(policy) {
  if (policy.min_age == null && policy.max_age == null) return '나이 조건 확인 필요';
  const range = policy.min_age == null ? `만 ${policy.max_age}세 이하`
    : policy.max_age == null ? `만 ${policy.min_age}세 이상`
      : `만 ${policy.min_age}~${policy.max_age}세`;
  return policy.eligibility_verified ? range : `${range} · 공고 확인 필요`;
}

function regionsText(policy) {
  return policy.regions?.length ? policy.regions.join(' · ') : '지원 지역 확인 필요';
}

function documentsText(policy) {
  const documents = asArray(policy.required_documents).map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean);
  return documents.length ? documents.join(', ') : '공식 공고 확인 필요';
}

function conditionsText(policy) {
  const found = [];
  const names = { age: '나이', region: '거주 지역', region_code: '거주 지역',
    residence_months: '거주 기간', current_status: '현재 상태', housing_type: '주거 형태',
    home_ownership: '주택 소유', final_education: '학력', household_type: '가구 형태' };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node.text === 'string' && node.text.trim()) found.push(node.text.trim());
    else if (policy.eligibility_verified && node.field && node.value != null) {
      const value = Array.isArray(node.value) ? node.value.filter((part) => part != null).join('~') : String(node.value);
      if (value) found.push(`${names[node.field] ?? node.field}: ${value}`);
    }
    for (const key of ['required', 'all', 'any', 'conditions']) visit(node[key]);
  };
  visit(policy.eligibility_conditions?.required);
  visit(policy.eligibility_conditions?.all);
  const income = policy.income_condition?.trim();
  if (income) found.push(`소득: ${income}`);
  const unique = [...new Set(found)];
  return unique.length ? `${unique.slice(0, 3).join(' · ')}${policy.eligibility_verified ? '' : ' · 공고 확인 필요'}`
    : '신청 조건 확인 필요';
}

function benefitText(policy) {
  const content = policy.support_content || policy.support_summary;
  if (content && policy.benefit_type && !content.includes(policy.benefit_type))
    return `${content} · ${policy.benefit_type}`;
  return content || policy.benefit_type || '지원 내용 확인 필요';
}

const normalizeTitle = (title) => String(title ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

function ConditionResult({ result, isLoading, isLoggedIn }) {
  if (!isLoggedIn) return <span className="compare-condition compare-condition--muted">로그인 후 확인</span>;
  if (isLoading) return <span className="compare-condition compare-condition--muted">확인 중</span>;
  const type = result === 'ELIGIBLE' ? 'ok' : result === 'INELIGIBLE' ? 'no' : 'check';
  return <span className={`compare-condition compare-condition--${type}`}>{verdictText[result] ?? '! 확인 필요'}</span>;
}

const shortTitle = (title) => !title ? '' : title.length > 10 ? `${title.slice(0, 10)}…` : title;

export default function PolicyComparePage() {
  const { policyId, comparisonId } = useParams();
  return <PolicyCompareView key={policyId} policyId={policyId} comparisonId={comparisonId ?? 'select'} />;
}

function PolicyCompareView({ policyId, comparisonId }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const choosing = comparisonId === 'select';
  const [search, setSearch] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [keyword, setKeyword] = useState('');
  const base = useQuery({ queryKey: ['policy', user?.id, policyId],
    queryFn: () => fetchPolicy(policyId), enabled: !!user && choosing });
  const compared = useQuery({
    queryKey: ['policy-comparison', user?.id, policyId, comparisonId],
    queryFn: () => fetchPolicyComparison(policyId, comparisonId),
    enabled: !!user && !choosing && comparisonId !== policyId,
  });
  const aiSummary = useQuery({
    queryKey: ['policy-compare-ai-summary', user?.id, policyId, comparisonId,
      compared.dataUpdatedAt],
    queryFn: () => fetchAiComparisonSummary(policyId, comparisonId),
    enabled: !!user && !choosing && !!compared.data,
    staleTime: 5 * 60 * 1000, retry: false,
  });
  const filters = useQuery({ queryKey: ['search-filters'], queryFn: fetchSearchFilters, enabled: !!user && choosing });
  const similar = useQuery({
    queryKey: ['policy-compare-similar', user?.id, policyId],
    queryFn: () => fetchSimilarPolicies(policyId, { limit: 3 }),
    enabled: !!user && choosing && !!base.data,
  });
  const aiCandidates = useQuery({
    queryKey: ['policy-compare-ai-candidates', user?.id, policyId, base.dataUpdatedAt],
    queryFn: () => fetchAiCompareCandidates(policyId),
    enabled: !!user && choosing && !!base.data,
    staleTime: 5 * 60 * 1000, retry: false,
  });
  const candidates = useQuery({
    queryKey: ['policy-compare-options', user?.id, policyId, keyword],
    queryFn: () => fetchPolicies({ q: keyword, sort: 'recommended', size: 100, page: 1 }),
    enabled: !!user && choosing && !!base.data && !!keyword,
  });

  useEffect(() => { window.scrollTo(0, 0); }, [comparisonId]);

  const basePolicy = choosing ? base.data : compared.data?.base;
  const resultPolicy = compared.data?.comparison;
  const baseTitle = normalizeTitle(basePolicy?.title);
  const searching = Boolean(keyword) && keyword === search.trim();
  const typing = Boolean(search.trim()) && !searching;
  const allOptions = typing ? [] : searching ? candidates.data?.items ?? []
    : aiCandidates.data?.items ?? similar.data?.items ?? [];
  const optionsLoading = typing ? false : searching ? candidates.isLoading
    : !aiCandidates.data && !similar.data && (aiCandidates.isLoading || similar.isLoading);
  const optionsError = typing ? null : searching ? candidates.error
    : aiCandidates.error && similar.error;
  const available = allOptions.filter((item) => item.policy_id !== policyId &&
    normalizeTitle(item.title) !== baseTitle && item.item_type !== 'PLACE');
  const selected = selectedPolicy?.policy_id !== policyId && normalizeTitle(selectedPolicy?.title) !== baseTitle
    ? selectedPolicy : null;
  const visibleOptions = selected && !available.some((item) => item.policy_id === selected.policy_id)
    ? [selected, ...available] : available;
  const categoryNames = new Map(filters.data?.categories?.map((item) => [item.category_id, item.display_name]) ?? []);
  const regionNames = new Map(filters.data?.regions?.map((item) => [item.region_code, item.region_name]) ?? []);
  const selectPath = `/policies/${policyId}/compare/select`;

  function regionName(item) {
    if (item.regions?.length) return item.regions[0];
    const code = item.region_codes?.[0];
    return code === '26' ? '부산광역시' : code === 'KR' ? '전국' : regionNames.get(code) ?? '지역 확인 필요';
  }

  if (!user) return <div className="policy-compare-page"><StateMessage isEmpty emptyText="정책 비교에는 로그인이 필요해요." /></div>;

  return <div className="policy-compare-page">
    <header className="policy-compare-header">
      <button type="button" aria-label="뒤로 가기" onClick={() => navigate(-1)}><BackIcon /></button>
      <h1>{choosing ? '비교할 정책 선택' : '정책 비교'}</h1>
      {!choosing && <button type="button" className="policy-compare-change" onClick={() => navigate(selectPath)}>비교 정책 변경</button>}
    </header>

    {choosing && base.isLoading && <StateMessage isLoading />}
    {choosing && base.error && <StateMessage error={base.error} />}
    {basePolicy && choosing && <>
      <div className="policy-compare-select-content">
        <p className="policy-compare-eyebrow">기준 정책</p>
        <div className="policy-compare-base-card">
          <div className="policy-compare-tags"><span>{basePolicy.category_name ?? '정책'}</span><span>{basePolicy.regions?.[0] ?? '지역 확인 필요'}</span></div>
          <strong>{basePolicy.title}</strong>
          <small>기준 정책은 바꿀 수 없어요</small>
        </div>
        <PolicyAutocomplete value={search} context="compare" basePolicyId={policyId} liveSuggestions
          onChange={(value) => { setSearch(value); setKeyword(''); setSelectedPolicy(null); }}
          onSearch={(value) => { setSearch(value.trim()); setKeyword(value.trim()); setSelectedPolicy(null); }}
          onSelectPolicy={(policy) => {
            if (policy.policy_id === policyId || normalizeTitle(policy.title) === baseTitle) return;
            setSearch(policy.title);
            setKeyword('');
            setSelectedPolicy(policy);
          }}
          renderInput={(inputProps, submit) => <div className="policy-compare-search"><SearchIcon />
            <input {...inputProps} placeholder="비교할 정책을 검색해 보세요" aria-label="비교할 정책 검색" />
            <button type="button" className="policy-compare-search-button" onClick={submit}>검색</button>
          </div>} />
        {!typing && <div className="policy-compare-list-title"><span aria-hidden="true">✦</span><h2>{searching ? '검색 결과' : 'AI 추천 비교 후보'}</h2><small>{visibleOptions.length}건</small></div>}
        {optionsLoading && <StateMessage isLoading />}
        {optionsError && <StateMessage error={optionsError} />}
        {!typing && !optionsLoading && !optionsError && !visibleOptions.length && <StateMessage isEmpty emptyText="비교할 정책을 찾지 못했어요." />}
        <div className={`policy-compare-options${typing ? ' policy-compare-options--typing' : ''}`}>{visibleOptions.map((item) => <div key={item.policy_id}
          className={`policy-compare-option${selected?.policy_id === item.policy_id ? ' is-selected' : ''}`}>
          <button type="button" className="policy-compare-option-select" aria-pressed={selected?.policy_id === item.policy_id}
            aria-label={`${item.title} 비교 후보 선택`} onClick={() => setSelectedPolicy(item)}>
            <span className="policy-compare-radio" aria-hidden="true">{selected?.policy_id === item.policy_id ? '✓' : ''}</span>
            <span className="policy-compare-option-copy"><strong>{item.title}</strong>
              <span className="policy-compare-tags"><span>{item.category_name ?? categoryNames.get(item.category_id) ?? '정책'}</span><span>{regionName(item)}</span></span>
              {item.support_summary?.trim() && <small>{item.support_summary.trim()}</small>}
            </span>
          </button>
          <button type="button" className="policy-compare-option-detail" aria-label={`${item.title} 정책 상세 보기`}
            onClick={() => navigate(`/policies/${item.policy_id}`)}>›</button>
        </div>)}</div>
        {!typing && !searching && similar.data && allOptions.length >= 3 && <p className="policy-compare-search-hint">다른 정책은 위 검색창에서 찾을 수 있어요.</p>}
      </div>
      <div className="policy-compare-bottom"><button type="button" disabled={!selected}
        onClick={() => navigate(`/policies/${policyId}/compare/${selected.policy_id}`)}>이 정책과 비교하기</button></div>
    </>}

    {!choosing && <>
      {comparisonId === policyId ? <p className="policy-compare-message">기준 정책과 같은 정책은 비교할 수 없어요.</p>
        : compared.isLoading ? <StateMessage isLoading />
          : compared.error ? <StateMessage error={compared.error} />
            : basePolicy && resultPolicy && <div className="policy-compare-result-content">
              <div className="policy-compare-policies">{[basePolicy, resultPolicy].map((policy, index) => <div className="policy-compare-policy" key={policy.policy_id}>
                <span>정책 {index === 0 ? 'A' : 'B'}</span><strong>{policy.title}</strong><small>{policy.regions?.[0] ?? '지역 확인 필요'}</small>
              </div>)}</div>
              <div className="policy-compare-table" role="table" aria-label="정책 비교 항목">
                {[
                  ['정책명', basePolicy.title, resultPolicy.title],
                  ['지원 대상', basePolicy.target_summary, resultPolicy.target_summary],
                  ['지원 내용·혜택', benefitText(basePolicy), benefitText(resultPolicy)],
                  ['신청 조건', conditionsText(basePolicy), conditionsText(resultPolicy)],
                  ['신청 기간', periodText(basePolicy), periodText(resultPolicy)],
                  ['모집 상태', basePolicy.recruitment_status, resultPolicy.recruitment_status],
                  ['나이 조건', ageText(basePolicy), ageText(resultPolicy)],
                  ['지원 지역', regionsText(basePolicy), regionsText(resultPolicy)],
                  ['신청 방법', basePolicy.application_method, resultPolicy.application_method],
                  ['필요 서류', documentsText(basePolicy), documentsText(resultPolicy)],
                ].map(([label, a, b]) => <div className="policy-compare-row" role="row" key={label}>
                  <span role="rowheader">{label}</span><span role="cell">{a || '확인 필요'}</span><span role="cell">{b || '확인 필요'}</span>
                </div>)}
                <div className="policy-compare-row" role="row"><span role="rowheader">내 조건</span>
                  <span role="cell"><ConditionResult result={compared.data?.eligibility?.base?.result} isLoggedIn={!!user} /></span>
                  <span role="cell"><ConditionResult result={compared.data?.eligibility?.comparison?.result} isLoggedIn={!!user} /></span>
                </div>
              </div>
              <section className="policy-compare-summary" aria-label="AI 정책 비교 요약">
                <h2><span aria-hidden="true">✦</span>AI 비교 요약</h2>
                {aiSummary.isLoading ? <p>두 정책의 확인된 정보를 비교하고 있어요.</p>
                  : aiSummary.isError || !aiSummary.data?.summary?.summary
                    ? <p>기본 정보 기반 안내예요. AI 비교 요약을 불러오지 못해 위 비교표의 실제 정책 정보만 보여드려요.</p>
                    : <>
                      <p>{aiSummary.data.summary.summary}</p>
                      {aiSummary.data.summary.difference_points?.length > 0 && <ul className="policy-compare-diff" aria-label="주요 차이">
                        {aiSummary.data.summary.difference_points.map((point) => <li key={point.topic}>
                          <b>{point.topic}</b>
                          <span>{shortTitle(basePolicy?.title)} · {point.a}</span>
                          <span>{shortTitle(resultPolicy?.title)} · {point.b}</span>
                        </li>)}
                      </ul>}
                      {aiSummary.data.summary.recommendation && <div className="policy-compare-recommendation">
                        <strong>{aiSummary.data.summary.recommendation.ai_confirmed ? 'AI 최종 추천' : '프로필 기준 추천'}</strong>
                        <p>{aiSummary.data.summary.recommendation.reason}</p>
                      </div>}
                    </>}
              </section>
              <p className="policy-compare-footnote">정책 정보는 변경될 수 있어요. 신청 전 공식 공고를 확인해 주세요.</p>
            </div>}
    </>}
  </div>;
}
