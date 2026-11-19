import { useEffect, useRef, useState } from 'react';
import CategoryIcon from '../home/CategoryIcon.jsx';
import { CATEGORY_STYLE } from '../home/homeConfig.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchPolicies, fetchSearchFilters } from '../../api/policies';
import { addBookmark, fetchBookmarks, fetchProfile, removeBookmark } from '../../api/me';
import { UNBOOKMARK_TOAST, useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { dDayText } from '../../utils/format';
import SelectMenu from '../../components/SelectMenu.jsx';
import NotificationBell from '../../components/NotificationBell.jsx';
import DrBuFaceButton from '../../components/DrBuFaceButton.jsx';
import PolicyAutocomplete from '../../components/PolicyAutocomplete.jsx';
import {
  ArtIcon, BackIcon, BriefcaseIcon, ClockIcon, CoinIcon,
  HealthIcon, HeartIcon, HomeIcon, SearchIcon,
} from '../../components/icons.jsx';
import SearchFilters from './SearchFilters.jsx';
import { emptyFilters } from './searchFilterData';

const categoryItems = [
  { label: '주거·생활', Icon: HomeIcon, color: 'blue' },
  { label: '취업·진로', Icon: BriefcaseIcon, color: 'pink' },
  { label: '장학·금융', Icon: CoinIcon, color: 'yellow' },
  { label: '문화', Icon: ArtIcon, color: 'green' },
  { label: '복지·건강', Icon: HealthIcon, color: 'purple' },
];
const recentKey = 'cheonghae-recent-policy-searches';
const previousDemoTerms = ['대학생 장학금', '청년 월세 지원', '사하구 지원금'];
const categoryLabel = (name) => name === '문화·예술' ? '문화' : name;
const categoryTagTone = {
  '주거·생활': 'blue', '취업·진로': 'pink', '장학·금융': 'purple',
  문화: 'green', '문화·예술': 'green', '복지·건강': 'purple',
};
const eligibilityTags = {
  ELIGIBLE: { text: '✓ 신청 가능', tone: 'eligible' },
  CHECK: { text: '! 확인 필요', tone: 'check' },
  INELIGIBLE: { text: '× 대상 아님', tone: 'ineligible' },
};

function readRecentTerms() {
  try {
    const stored = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
    if (Array.isArray(stored) && stored.length === previousDemoTerms.length &&
      stored.every((term, index) => term === previousDemoTerms[index])) return [];
    return Array.isArray(stored) ? stored.filter((term) => typeof term === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}

function SearchEntry({ value, onOpen, editableOnType = false, onInput }) {
  const inputRef = useRef(null);
  const composing = useRef(false);
  const opening = useRef(false);

  function handleInput(next) {
    onInput?.(next);
    if (next.trim() && !composing.current && !opening.current) {
      opening.current = true;
      onOpen(next);
    }
  }

  return <div className="policy-search-form" onClick={editableOnType ? undefined : () => onOpen()}>
    <SearchIcon />
    <input ref={inputRef} value={value} readOnly={!editableOnType}
      onChange={editableOnType ? (event) => handleInput(event.target.value) : undefined}
      onCompositionStart={editableOnType ? () => { composing.current = true; } : undefined}
      onCompositionUpdate={editableOnType ? (event) => { onInput?.(event.currentTarget.value); } : undefined}
      onCompositionEnd={editableOnType ? (event) => {
        composing.current = false;
        handleInput(event.currentTarget.value);
      } : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (!editableOnType || value.trim()) onOpen(value);
      }}
      placeholder="정책명 또는 키워드를 입력해주세요"
      aria-label={editableOnType ? '정책 검색어' : '정책 검색어 입력 화면 열기'} />
    <button type="button" onClick={editableOnType ? () => inputRef.current?.focus() : undefined}>검색</button>
  </div>;
}

function periodText(policy) {
  if (policy.is_always_open) return '상시 모집';
  if (!policy.application_start_date && !policy.application_end_date) return '기간 미정';
  return `${policy.application_start_date ?? '시작일 미정'} ~ ${policy.application_end_date ?? '종료일 미정'}`;
}

function restoreSearchView(saved, searchParams) {
  const defaults = emptyFilters();
  const candidate = saved?.applied;
  const applied = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? {
      ...defaults,
      ...Object.fromEntries(['categories', 'details', 'regions', 'statuses'].map((key) =>
        [key, Array.isArray(candidate[key]) ? candidate[key].filter((value) => typeof value === 'string') : []])),
      dateStart: typeof candidate.dateStart === 'string' ? candidate.dateStart : '',
      dateEnd: typeof candidate.dateEnd === 'string' ? candidate.dateEnd : '',
      includeAlways: candidate.includeAlways === true,
      myConditionsOnly: candidate.myConditionsOnly === true,
      conditions: candidate.conditions && typeof candidate.conditions === 'object' && !Array.isArray(candidate.conditions)
        ? Object.fromEntries(Object.entries(candidate.conditions).filter(([key]) => key !== 'age')) : {},
    }
    : { ...defaults,
      categories: searchParams.get('category') ? [categoryLabel(searchParams.get('category'))] : [],
      myConditionsOnly: searchParams.get('mine') === 'true',
    };
  return {
    applied,
    sort: ['recommended', 'deadline', 'latest'].includes(saved?.sort) ? saved.sort : 'recommended',
    page: Number.isSafeInteger(saved?.page) && saved.page > 0 ? saved.page : 1,
    eligibleOnly: saved?.eligibleOnly === true,
    excludeClosed: saved?.excludeClosed === true,
  };
}

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialView] = useState(() => restoreSearchView(location.state?.searchView, searchParams));
  const [draftInput, setDraftInput] = useState(null);
  const [recentTerms, setRecentTerms] = useState(readRecentTerms);
  const [filterOpen, setFilterOpen] = useState(false);
  const [applied, setApplied] = useState(initialView.applied);
  const [draft, setDraft] = useState(emptyFilters);
  const [sort, setSort] = useState(initialView.sort);
  const [page, setPage] = useState(initialView.page);
  const [eligibleOnly, setEligibleOnly] = useState(initialView.eligibleOnly);
  const [excludeClosed, setExcludeClosed] = useState(initialView.excludeClosed);
  const [bookmarkError, setBookmarkError] = useState('');
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const showToast = useToastStore((state) => state.show);

  const routeQuery = searchParams.get('q') ?? '';
  const input = draftInput ?? routeQuery;
  const categoryName = searchParams.get('category') ?? '';
  const hasSearch = searchParams.has('q') || searchParams.has('category') || searchParams.has('results');
  const previewingInput = hasSearch && !routeQuery.trim() && Boolean(draftInput?.trim());
  const searchFilters = useQuery({ queryKey: ['search-filters'], queryFn: fetchSearchFilters,
    enabled: Boolean(user) });
  const filterCategories = searchFilters.data?.categories ?? [];
  const filterRegions = searchFilters.data?.regions ?? [];
  const subcategories = Object.fromEntries(filterCategories.map((category) => [category.display_name,
    category.subcategories.map((sub) => sub.subcategory_name)]));
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: fetchProfile, enabled: Boolean(user && hasSearch) });
  const categoryIds = applied.categories.map((name) => filterCategories.find(
    (category) => category.display_name === name,
  )?.category_id).filter(Boolean);
  const unmatchedCategory = Boolean(applied.categories.length && searchFilters.isSuccess && !categoryIds.length);
  function makeParams(filters, currentPage = 1, currentSize = 20) {
    const selectedCategories = filters.categories
      .map(categoryLabel).filter((name) => filterCategories.some((category) => category.display_name === name));
    const ids = selectedCategories.map((name) => filterCategories.find(
      (category) => category.display_name === name || category.category_name === name,
    )?.category_id).filter(Boolean);
    const selectedDetails = filters.details;
    const partialDetails = selectedCategories.flatMap((name) => {
      const subs = subcategories[name] ?? [];
      const chosen = subs.filter((value) => selectedDetails.includes(value));
      const categoryId = filterCategories.find((category) => category.display_name === name || category.category_name === name)?.category_id;
      return chosen.length && chosen.length < subs.length && categoryId ? [{ categoryId, details: chosen }] : [];
    });
    return {
    q: routeQuery || undefined,
    categoryIds: ids.length ? ids.join(',') : undefined,
    categoryDetails: partialDetails.length ? JSON.stringify(partialDetails) : undefined,
    regions: filters.regions.length ? filters.regions.join(',') : undefined,
    statuses: filters.statuses.length ? filters.statuses.join(',') : undefined,
    dateStart: filters.dateStart || undefined,
    dateEnd: filters.dateEnd || undefined,
    includeAlways: filters.includeAlways || undefined,
    eligibleOnly: eligibleOnly || undefined,
    excludeClosed: excludeClosed || undefined,
    myConditionsOnly: filters.myConditionsOnly || undefined,
    conditions: (!filters.myConditionsOnly || !profile.data) && Object.values(filters.conditions).some((value) => value !== '' && value != null && (!Array.isArray(value) || value.length))
      ? JSON.stringify(filters.conditions) : undefined,
    sort,
    page: currentPage,
    size: currentSize,
    };
  }
  const params = { ...makeParams(applied, page), includeEligibility: Boolean(user) };
  const policies = useQuery({
    queryKey: ['policies', user?.id ?? null, params],
    queryFn: () => fetchPolicies(params),
    enabled: hasSearch && !unmatchedCategory && searchFilters.isSuccess &&
      (!location.state?.searchView?.userId || location.state.searchView.userId === user?.id),
  });
  const draftParams = makeParams(draft, 1, 1);
  const draftCategoryMatched = !draft.categories.length || draft.categories.some((name) =>
    filterCategories.some((category) => category.display_name === name));
  const draftResults = useQuery({
    queryKey: ['search-filter-count', draftParams],
    queryFn: () => fetchPolicies(draftParams),
    enabled: filterOpen && searchFilters.isSuccess && draftCategoryMatched,
  });
  const bookmarks = useQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: fetchBookmarks,
    enabled: Boolean(user && hasSearch),
  });
  const bookmarkMutation = useMutation({
    mutationFn: ({ policyId, saved }) =>
      saved ? removeBookmark(policyId) : addBookmark(policyId, 'SEARCH'),
    onSuccess: (_result, { saved }) => {
      setBookmarkError('');
      if (saved) showToast(UNBOOKMARK_TOAST);
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
    onError: () => setBookmarkError('관심 정책을 저장하지 못했어요. 다시 시도해주세요.'),
  });
  const savedIds = new Set(bookmarks.data?.map((bookmark) => bookmark.policy?.policy_id) ?? []);
  const chips = [
    ...applied.categories.flatMap((category) => {
      const subs = subcategories[category] ?? [];
      const chosen = subs.filter((item) => applied.details.includes(item));
      return chosen.length && chosen.length < subs.length
        ? chosen.map((value) => ({ type: 'detail', value, category }))
        : [{ type: 'category', value: category }];
    }),
    ...applied.regions.map((code) => ({ type: 'region', value: filterRegions.find((region) => region.region_code === code)?.region_name ?? code, code })),
    ...applied.statuses.map((value) => ({ type: 'status', value })),
    ...(applied.dateStart || applied.dateEnd ? [{ type: 'date', value: '신청 기간' }] : []),
  ];
  const filterCount = [applied.categories.length, applied.regions.length, applied.statuses.length,
    applied.dateStart || applied.dateEnd, applied.myConditionsOnly, !applied.myConditionsOnly && Object.values(applied.conditions).some((value) => value !== '' && value != null && (!Array.isArray(value) || value.length))].filter(Boolean).length;

  useEffect(() => {
    try {
      localStorage.setItem(recentKey, JSON.stringify(recentTerms));
    } catch {
      // The search screen remains usable when browser storage is unavailable.
    }
  }, [recentTerms]);

  useEffect(() => {
    if (!hasSearch || !user?.id) return;
    const previous = location.state?.searchView;
    if (previous?.userId && previous.userId !== user.id) {
      const reset = restoreSearchView(null, searchParams);
      setApplied(reset.applied);
      setSort(reset.sort);
      setPage(reset.page);
      setEligibleOnly(reset.eligibleOnly);
      setExcludeClosed(reset.excludeClosed);
      navigate(`${location.pathname}${location.search}`, { replace: true,
        state: { ...location.state, searchView: { userId: user.id, ...reset } }, preventScrollReset: true });
      return;
    }
    const view = { userId: user.id, applied, sort, page, eligibleOnly, excludeClosed };
    if (JSON.stringify(previous) !== JSON.stringify(view))
      navigate(`${location.pathname}${location.search}`, { replace: true,
        state: { ...location.state, searchView: view }, preventScrollReset: true });
  }, [applied, eligibleOnly, excludeClosed, hasSearch, location.pathname, location.search, location.state, navigate, page, searchParams, sort, user?.id]);

  function submitSearch(term = input) {
    const query = term.trim();
    if (query) setRecentTerms((current) => [query, ...current.filter((item) => item !== query)].slice(0, 10));
    setDraftInput(null);
    setPage(1);
    setSearchParams(query ? { results: '1', q: query } : { results: '1' });
  }

  function openSearchInput(nextTerm = input) {
    navigate('/search/input', { state: { fromSearch: true, term: nextTerm,
      searchView: hasSearch ? { userId: user?.id, applied, sort, page, eligibleOnly, excludeClosed } : null } });
  }

  function browseCategory(name) {
    setDraftInput(null);
    setPage(1);
    setApplied({ ...emptyFilters(), categories: [name] });
    setSearchParams({ category: name });
  }

  function openFilters() {
    setDraft({ ...applied, details: [...new Set([...applied.details,
      ...applied.categories.flatMap((name) => {
        const subs = subcategories[name] ?? [];
        return subs.some((item) => applied.details.includes(item)) ? [] : subs;
      })])] });
    setFilterOpen(true);
  }

  function applyFilters() {
    setPage(1);
    setApplied(draft);
    setFilterOpen(false);
    const next = { results: '1' };
    if (routeQuery) next.q = routeQuery;
    setSearchParams(next);
  }

  function removeChip(chip) {
    setPage(1);
    setApplied((current) => {
      if (chip.type === 'category') return { ...current, categories: current.categories.filter((name) => name !== chip.value),
        details: current.details.filter((name) => !(subcategories[chip.value] ?? []).includes(name)) };
      if (chip.type === 'detail') {
        const details = current.details.filter((name) => name !== chip.value);
        return { ...current, details, categories: (subcategories[chip.category] ?? []).some((name) => details.includes(name))
          ? current.categories : current.categories.filter((name) => name !== chip.category) };
      }
      if (chip.type === 'region') return { ...current, regions: current.regions.filter((code) => code !== chip.code) };
      if (chip.type === 'status') return { ...current, statuses: current.statuses.filter((value) => value !== chip.value) };
      return { ...current, dateStart: '', dateEnd: '' };
    });
    if (categoryName) setSearchParams(routeQuery ? { results: '1', q: routeQuery } : { results: '1' });
  }

  return (
    <div className="search-page">
      <header className={`search-header${hasSearch ? ' search-header--results' : ''}`}>
        <div className="search-header-row">
          {hasSearch && !previewingInput && <button className="search-back" type="button" aria-label="뒤로 가기"
            onClick={() => { setDraftInput(null); navigate('/search'); }}><BackIcon /></button>}
          <h1>{hasSearch && !previewingInput ? '검색 결과' : '정책 찾기'}</h1>
          <div className="search-header-notification"><DrBuFaceButton /><NotificationBell onClick={() => navigate('/notifications')} /></div>
        </div>
        <SearchEntry value={input} onOpen={openSearchInput}
          editableOnType={hasSearch && !routeQuery.trim()} onInput={setDraftInput} />
      </header>

      {previewingInput ? (
        <div className="search-input-preview">
          <PolicyAutocomplete value={input} onChange={setDraftInput} onSearch={submitSearch}
            onSelectTerm={submitSearch}
            onSelectPolicy={(policy) => navigate(`/policies/${policy.policy_id}`)}
            liveSuggestions inlineSuggestions alwaysOpen renderInput={() => null} />
          {!user && <p className="search-state">로그인 후 정책을 검색할 수 있어요.</p>}
        </div>
      ) : !hasSearch ? (
        <div className="search-landing">
          <div className="search-landing-card">
            <section>
              <h2>카테고리로 둘러보기</h2>
              <div className="search-category-grid">
                {categoryItems.filter(({ label }) => filterCategories.some((category) => category.display_name === label)).map(({ label, Icon, color }) => (
                  <button type="button" className="search-category" key={label} onClick={() => browseCategory(label)}>
                    {CATEGORY_STYLE[label] ? (
                      // 홈 분야 아이콘과 같은 모양·색
                      <span className="search-category-icon search-category-icon--home"
                        style={{ background: CATEGORY_STYLE[label].bg, color: CATEGORY_STYLE[label].color }}>
                        <CategoryIcon name={label} />
                      </span>
                    ) : (
                      <span className={`search-category-icon search-category-icon--${color}`}><Icon /></span>
                    )}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {searchFilters.isError && <p className="search-state search-state--error">카테고리를 불러오지 못했어요.</p>}
              {!user && <p className="search-state">로그인 후 정책을 검색할 수 있어요.</p>}
            </section>
          </div>

          <div className="search-landing-card">
            <section className="search-landing-section">
                <div className="search-section-heading">
                  <h2>최근 검색어</h2>
                  {recentTerms.length > 0 && <button type="button" onClick={() => setRecentTerms([])}>전체 삭제</button>}
                </div>
                <div className="search-recent-list">
                  {recentTerms.length === 0 && <p className="search-state">없음</p>}
                  {recentTerms.slice(0, 3).map((term, index) => (
                    <div className="search-recent-row" key={term}>
                      <button type="button" className="search-recent-open" onClick={() => submitSearch(term)}>
                        <ClockIcon />
                        <span className="search-recent-term">{term}</span>
                        <span className="search-recent-date">{index === 0 ? '오늘' : index === 1 ? '어제' : '09.28'}</span>
                      </button>
                      <button type="button" className="search-recent-delete" aria-label={`최근 검색어 ${term} 삭제`}
                        onClick={() => setRecentTerms((current) => current.filter((item) => item !== term))}>×</button>
                    </div>
                  ))}
                </div>
              </section>
          </div>
        </div>
      ) : (
        <div className="search-results">
          <div className="search-filter-strip">
            <button type="button" className={`search-filter-button${filterCount ? ' is-active' : ''}`}
              aria-label={filterCount ? `필터, ${filterCount}개 적용 중` : '필터'} onClick={openFilters}>
              {/* 지도 탭의 필터 버튼과 같은 아이콘·배지 */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h3M13 6h7M4 12h9M19 12h1M4 18h1M11 18h9" /><circle cx="10" cy="6" r="2.2" /><circle cx="16" cy="12" r="2.2" /><circle cx="8" cy="18" r="2.2" />
              </svg>
              {filterCount > 0 && <span className="search-filter-badge">{filterCount}</span>}
            </button>
            {chips.slice(0, 3).map((chip) => <button type="button" key={`${chip.type}-${chip.value}`}
              className="search-applied-chip" onClick={() => removeChip(chip)}>{chip.value} ×</button>)}
            {chips.length > 3 && <button type="button" className="search-more-chip" onClick={openFilters}>+{chips.length - 3}</button>}
          </div>
          {(applied.myConditionsOnly || Object.values(applied.conditions).some((value) => value !== '' && value != null && (!Array.isArray(value) || value.length))) &&
            <button type="button" className="search-applied-conditions" onClick={openFilters}>
              {applied.myConditionsOnly ? '내 프로필 조건' : '직접 설정한 조건'} 적용 중 <span>›</span>
            </button>}
          <section className="search-result-content">
            <div className="search-result-heading">
              <h2>검색 결과 <span>{unmatchedCategory ? 0 : (policies.data?.totalCount ?? 0)}건</span></h2>
              <button type="button" className={`search-result-toggle${eligibleOnly ? ' is-active' : ''}`}
                aria-pressed={eligibleOnly} onClick={() => { setEligibleOnly((current) => !current); setPage(1); }}>신청 가능</button>
              <button type="button" className={`search-result-toggle${excludeClosed ? ' is-active' : ''}`}
                aria-pressed={excludeClosed} onClick={() => { setExcludeClosed((current) => !current); setPage(1); }}>마감 제외</button>
              <SelectMenu label="정렬 순서" value={sort} className="search-sort-menu" menuMinWidth={148}
                options={[{ value: 'recommended', label: '추천순' }, { value: 'deadline', label: '마감 임박순' }, { value: 'latest', label: '최신순' }]}
                onChange={(next) => { setSort(next); setPage(1); }} />
            </div>
            {(searchFilters.isLoading || policies.isLoading) && !unmatchedCategory && <p className="search-state">정책을 불러오는 중이에요…</p>}
            {searchFilters.isError && <p className="search-state search-state--error">검색 필터를 불러오지 못했어요. 다시 시도해주세요.</p>}
            {!user && <p className="search-state">로그인 후 정책을 검색할 수 있어요.</p>}
            {policies.error && <p className="search-state search-state--error">정책을 불러오지 못했어요. 다시 시도해주세요.</p>}
            {bookmarkError && <p className="search-bookmark-error" role="alert">{bookmarkError}</p>}
            {policies.data?.items?.length > 0 && (
              <div className="search-result-list">
                {policies.data.items.map((policy) => {
                  const policyCategory = filterCategories.find((item) => item.category_id === policy.category_id);
                  const eligibilityTag = eligibilityTags[policy.eligibility_result];
                  const saved = savedIds.has(policy.policy_id);
                  return (
                    <article className="search-policy-card" key={policy.policy_id} role="link" tabIndex={0}
                      onClick={() => navigate(`/policies/${policy.policy_id}`)}
                      onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/policies/${policy.policy_id}`); }}>
                      <div className="search-policy-top">
                        <div className="search-policy-tags">
                          {eligibilityTag && <span className={`search-policy-tag--${eligibilityTag.tone}`}>{eligibilityTag.text}</span>}
                          {policyCategory && <span className={`search-policy-tag--${categoryTagTone[policyCategory.category_name] ?? 'blue'}`}>{policyCategory.category_name}</span>}
                          {policy.region_codes?.length > 0 && <span className="search-policy-tag--region">{policy.region_codes.includes('KR') ? '전국' : policy.region_codes.includes('26') ? '부산광역시' : filterRegions.find((region) => policy.region_codes.includes(region.region_code))?.region_name ?? '부산광역시'}</span>}
                          {['마감', '종료'].includes(policy.recruitment_status) && <span className="search-policy-tag--closed">마감</span>}
                        </div>
                        <button type="button" className={`search-save-button${saved ? ' is-saved' : ''}`}
                          aria-label={saved ? `${policy.title} 관심 정책 해제` : `${policy.title} 관심 정책 저장`}
                          disabled={bookmarkMutation.isPending}
                          onClick={(event) => { event.stopPropagation(); user
                            ? bookmarkMutation.mutate({ policyId: policy.policy_id, saved })
                            : navigate('/my'); }}><HeartIcon /></button>
                      </div>
                      <div className="search-policy-main">
                        <h3>{policy.title}</h3>
                        {policy.support_summary?.trim() && <p>{policy.support_summary.trim()}</p>}
                      </div>
                      <div className="search-policy-bottom">
                        <span>신청기간 {periodText(policy)} · {policy.recruitment_status}</span>
                        <strong>{dDayText(policy.d_day, policy.recruitment_status)}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {(unmatchedCategory || (policies.data && policies.data.items.length === 0)) && (
              <div className="search-empty">
                <span><SearchIcon /></span>
                <strong>조건에 맞는 결과가 없어요</strong>
                <p>검색어나 필터를 다시 확인해주세요.</p>
              </div>
            )}
            {policies.data?.totalCount > 20 && (
              <div className="search-pagination">
                <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>이전</button>
                <span>{page} / {Math.ceil(policies.data.totalCount / 20)}</span>
                <button type="button" disabled={page * 20 >= policies.data.totalCount} onClick={() => setPage((current) => current + 1)}>다음</button>
              </div>
            )}
          </section>
        </div>
      )}

      {filterOpen && <SearchFilters draft={draft} setDraft={setDraft}
        count={draftCategoryMatched ? draftResults.data?.totalCount : 0}
        countLoading={draftCategoryMatched && draftResults.isLoading}
        profile={profile.data} categories={filterCategories} regions={filterRegions} onReset={() => setDraft(emptyFilters())}
        onApply={applyFilters} onClose={() => setFilterOpen(false)}
        onEditProfile={() => navigate('/settings?view=profile')} />}
    </div>
  );
}
