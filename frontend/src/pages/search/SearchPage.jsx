import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchPolicies, fetchSearchFilters } from '../../api/policies';
import { addBookmark, fetchBookmarks, fetchProfile, removeBookmark } from '../../api/me';
import { useAuthStore } from '../../store/authStore';
import { dDayText } from '../../utils/format';
import {
  ArtIcon, BackIcon, BriefcaseIcon, ClockIcon, CoinIcon,
  HealthIcon, HeartIcon, HomeIcon, SearchIcon,
} from '../../components/icons.jsx';
import SearchFilters from './SearchFilters.jsx';
import { emptyFilters } from './searchFilterData';

const categoryItems = [
  { label: '취업·진로', Icon: BriefcaseIcon, color: 'pink' },
  { label: '주거·생활', Icon: HomeIcon, color: 'blue' },
  { label: '장학·금융', Icon: CoinIcon, color: 'yellow' },
  { label: '문화', Icon: ArtIcon, color: 'green' },
  { label: '복지·건강', Icon: HealthIcon, color: 'purple' },
];
const popularTerms = ['청년 월세 지원', '국가장학금', '청년 적금'];
const recentKey = 'cheonghae-recent-policy-searches';
const previousDemoTerms = ['대학생 장학금', '청년 월세 지원', '사하구 지원금'];
const categoryLabel = (name) => name === '문화·예술' ? '문화' : name;

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

function SearchStatusBar() {
  return (
    <div className="search-status-bar" aria-label="기기 상태">
      <span>9:41</span>
      <span className="search-status-icons" aria-hidden="true">
        <svg viewBox="0 0 18 12" fill="currentColor"><rect x="1" y="7" width="3" height="4" rx="1" /><rect x="6" y="5" width="3" height="6" rx="1" /><rect x="11" y="2" width="3" height="9" rx="1" /></svg>
        <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M2 4.5a10 10 0 0 1 14 0" /><path d="M5 7.2a5.8 5.8 0 0 1 8 0" /><path d="M8 10a1.5 1.5 0 0 1 2 0" /></svg>
        <svg viewBox="0 0 26 12" fill="none"><rect x="1" y="1" width="21" height="10" rx="3" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="3" width="16" height="6" rx="1.5" fill="currentColor" /><path d="M24 4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </span>
    </div>
  );
}

function SearchForm({ value, onChange, onSubmit }) {
  return (
    <form className="policy-search-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <SearchIcon />
      <input value={value} onChange={(event) => onChange(event.target.value)}
        placeholder="정책명 또는 키워드를 입력해주세요" aria-label="정책 검색어" />
      <button type="submit">검색</button>
    </form>
  );
}

function periodText(policy) {
  if (policy.is_always_open) return '상시 모집';
  if (!policy.application_start_date && !policy.application_end_date) return '기간 미정';
  return `${policy.application_start_date ?? '시작일 미정'} ~ ${policy.application_end_date ?? '종료일 미정'}`;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftInput, setDraftInput] = useState(null);
  const [recentTerms, setRecentTerms] = useState(readRecentTerms);
  const [filterOpen, setFilterOpen] = useState(false);
  const [applied, setApplied] = useState(() => ({ ...emptyFilters(),
    categories: searchParams.get('category') ? [categoryLabel(searchParams.get('category'))] : [],
  }));
  const [draft, setDraft] = useState(emptyFilters);
  const [sort, setSort] = useState('recommended');
  const [page, setPage] = useState(1);
  const [bookmarkError, setBookmarkError] = useState('');
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const routeQuery = searchParams.get('q') ?? '';
  const input = draftInput ?? routeQuery;
  const categoryName = searchParams.get('category') ?? '';
  const hasSearch = searchParams.has('q') || searchParams.has('category') || searchParams.has('results');
  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const searchFilters = useQuery({ queryKey: ['search-filters'], queryFn: fetchSearchFilters });
  const filterCategories = searchFilters.data?.categories ?? [];
  const filterRegions = searchFilters.data?.regions ?? [];
  const subcategories = Object.fromEntries(filterCategories.map((category) => [category.display_name,
    category.subcategories.map((sub) => sub.subcategory_name)]));
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile, enabled: Boolean(user && hasSearch) });
  const categoryIds = applied.categories.map((name) => filterCategories.find(
    (category) => category.display_name === name,
  )?.category_id).filter(Boolean);
  const unmatchedCategory = Boolean(applied.categories.length && searchFilters.isSuccess && !categoryIds.length);
  function makeParams(filters, currentPage = 1, currentSize = 20) {
    const interestCategories = filters.myConditionsOnly ? profile.data?.interest_categories : filters.conditions.interest_categories;
    const selectedCategories = (filters.categories.length ? filters.categories : interestCategories ?? [])
      .map(categoryLabel).filter((name) => filterCategories.some((category) => category.display_name === name));
    const ids = selectedCategories.map((name) => filterCategories.find(
      (category) => category.display_name === name || category.category_name === name,
    )?.category_id).filter(Boolean);
    const selectedDetails = filters.categories.length ? filters.details
      : filters.myConditionsOnly ? [] : filters.conditions.interest_details ?? [];
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
    myConditionsOnly: filters.myConditionsOnly || undefined,
    conditions: (!filters.myConditionsOnly || !profile.data) && Object.values(filters.conditions).some((value) => value !== '' && value != null && (!Array.isArray(value) || value.length))
      ? JSON.stringify(filters.conditions) : undefined,
    sort,
    page: currentPage,
    size: currentSize,
    };
  }
  const params = makeParams(applied, page);
  const policies = useQuery({
    queryKey: ['policies', params],
    queryFn: () => fetchPolicies(params),
    enabled: hasSearch && !unmatchedCategory && searchFilters.isSuccess,
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
    queryKey: ['bookmarks'],
    queryFn: fetchBookmarks,
    enabled: Boolean(user && hasSearch),
  });
  const bookmarkMutation = useMutation({
    mutationFn: ({ policyId, saved }) =>
      saved ? removeBookmark(policyId) : addBookmark(policyId, 'search'),
    onSuccess: () => {
      setBookmarkError('');
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

  function submitSearch(term = input) {
    const query = term.trim();
    if (query) setRecentTerms((current) => [query, ...current.filter((item) => item !== query)].slice(0, 10));
    setDraftInput(null);
    setPage(1);
    setSearchParams(query ? { results: '1', q: query } : { results: '1' });
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
      <SearchStatusBar />
      <header className={`search-header${hasSearch ? ' search-header--results' : ''}`}>
        <div className="search-header-row">
          <button className="search-back" type="button" aria-label="뒤로 가기"
            onClick={() => { setDraftInput(null); navigate(hasSearch ? '/search' : '/'); }}><BackIcon /></button>
          {!hasSearch && <h1>정책 찾기</h1>}
          {hasSearch && <SearchForm value={input} onChange={setDraftInput} onSubmit={submitSearch} />}
        </div>
        {!hasSearch && <SearchForm value={input} onChange={setDraftInput} onSubmit={submitSearch} />}
      </header>

      {!hasSearch ? (
        <div className="search-landing">
          <div className="search-landing-card">
            <section>
              <h2>카테고리로 둘러보기</h2>
              <div className="search-category-grid">
                {categoryItems.filter(({ label }) => filterCategories.some((category) => category.display_name === label)).map(({ label, Icon, color }) => (
                  <button type="button" className="search-category" key={label} onClick={() => browseCategory(label)}>
                    <span className={`search-category-icon search-category-icon--${color}`}><Icon /></span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {searchFilters.isError && <p className="search-state search-state--error">카테고리를 불러오지 못했어요.</p>}
            </section>

            {recentTerms.length > 0 && (
              <section className="search-landing-section">
                <div className="search-section-heading">
                  <h2>최근 검색어</h2>
                  <button type="button" onClick={() => setRecentTerms([])}>전체 삭제</button>
                </div>
                <div className="search-recent-list">
                  {recentTerms.slice(0, 3).map((term, index) => (
                    <button type="button" key={term} onClick={() => submitSearch(term)}>
                      <ClockIcon />
                      <span className="search-recent-term">{term}</span>
                      <span className="search-recent-date">{index === 0 ? '오늘' : index === 1 ? '어제' : '09.28'}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="search-landing-section">
              <h2>지금 많이 찾는 검색어</h2>
              <div className="search-popular-terms">
                {popularTerms.map((term) => (
                  <button type="button" key={term} onClick={() => submitSearch(term)}>{term}</button>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="search-results">
          <div className="search-filter-strip">
            <button type="button" className={`search-filter-button${filterCount ? ' is-active' : ''}`}
              onClick={openFilters}>필터 {filterCount}</button>
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
              <label className="search-sort-label">
                <span className="sr-only">정렬 순서</span>
                <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
                  <option value="recommended">추천순</option>
                  <option value="deadline">마감 임박순</option>
                  <option value="latest">최신순</option>
                </select>
              </label>
            </div>
            {(searchFilters.isLoading || policies.isLoading) && !unmatchedCategory && <p className="search-state">정책을 불러오는 중이에요…</p>}
            {searchFilters.isError && <p className="search-state search-state--error">검색 필터를 불러오지 못했어요. 다시 시도해주세요.</p>}
            {categories.error && categoryName && <p className="search-state search-state--error">카테고리를 불러오지 못했어요.</p>}
            {policies.error && <p className="search-state search-state--error">정책을 불러오지 못했어요. 다시 시도해주세요.</p>}
            {bookmarkError && <p className="search-bookmark-error" role="alert">{bookmarkError}</p>}
            {policies.data?.items?.length > 0 && (
              <div className="search-result-list">
                {policies.data.items.map((policy) => {
                  const policyCategory = categories.data?.find((item) => item.category_id === policy.category_id);
                  const saved = savedIds.has(policy.policy_id);
                  return (
                    <article className="search-policy-card" key={policy.policy_id} role="link" tabIndex={0}
                      onClick={() => navigate(`/policies/${policy.policy_id}`)}
                      onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/policies/${policy.policy_id}`); }}>
                      <div className="search-policy-top">
                        <div className="search-policy-tags">
                          {policyCategory && <span>{policyCategory.category_name}</span>}
                          {policy.region_codes?.length > 0 && <span>{policy.region_codes.includes('KR') ? '전국' : policy.region_codes.includes('26') ? '부산광역시' : filterRegions.find((region) => policy.region_codes.includes(region.region_code))?.region_name ?? '부산광역시'}</span>}
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
                        {(policy.target_summary || policy.support_content) && <p>{policy.target_summary || policy.support_content}</p>}
                      </div>
                      <div className="search-policy-bottom">
                        <span>신청기간 {periodText(policy)}</span>
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
        onApply={applyFilters} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}
