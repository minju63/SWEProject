import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchSearchFilters } from '../../api/policies';
import { ArtIcon, BriefcaseIcon, ClockIcon, CoinIcon, HealthIcon, HomeIcon, SearchIcon } from '../../components/icons.jsx';
import NotificationBell from '../../components/NotificationBell.jsx';
import DrBuFaceButton from '../../components/DrBuFaceButton.jsx';
import PolicyAutocomplete from '../../components/PolicyAutocomplete.jsx';
import { useAuthStore } from '../../store/authStore';
import './SearchInputPage.css';

const recentKey = 'cheonghae-recent-policy-searches';
const previousDemoTerms = ['대학생 장학금', '청년 월세 지원', '사하구 지원금'];
const categoryItems = [
  { label: '주거·생활', Icon: HomeIcon, color: 'blue' },
  { label: '취업·진로', Icon: BriefcaseIcon, color: 'pink' },
  { label: '장학·금융', Icon: CoinIcon, color: 'yellow' },
  { label: '문화', Icon: ArtIcon, color: 'green' },
  { label: '복지·건강', Icon: HealthIcon, color: 'purple' },
];

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

export default function SearchInputPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const inputRef = useRef(null);
  const draftKey = `cheonghae-search-input-${location.key}`;
  const [term, setTerm] = useState(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved !== null) return saved;
    } catch {
      // Search remains available when browser storage is unavailable.
    }
    return new URLSearchParams(location.search).get('q') ?? location.state?.term ?? '';
  });
  const [recentTerms, setRecentTerms] = useState(readRecentTerms);
  const filters = useQuery({ queryKey: ['search-filters'], queryFn: fetchSearchFilters,
    enabled: Boolean(user && !term.trim()), staleTime: 5 * 60 * 1000 });

  useEffect(() => { inputRef.current?.focus(); }, []);

  function clearDraft() {
    try { sessionStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
  }

  function submitSearch(value = term) {
    clearDraft();
    const query = value.trim();
    if (query) {
      try {
        const saved = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
        const previous = Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : [];
        localStorage.setItem(recentKey,
          JSON.stringify([query, ...previous.filter((item) => item !== query)].slice(0, 10)));
      } catch {
        // Search remains available when browser storage is unavailable.
      }
    }
    const params = new URLSearchParams({ results: '1' });
    if (query) params.set('q', query);
    const searchView = location.state?.searchView;
    navigate(`/search?${params}`, { replace: true,
      state: searchView ? { searchView: { ...searchView, page: 1 } } : undefined });
  }

  function selectPolicy(policy) {
    try { sessionStorage.setItem(draftKey, term); } catch { /* Storage may be unavailable. */ }
    navigate(`/policies/${policy.policy_id}`);
  }

  function browseCategory(name) {
    clearDraft();
    navigate(`/search?category=${encodeURIComponent(name)}`, { replace: true });
  }

  function clearRecentTerms() {
    setRecentTerms([]);
    try { localStorage.setItem(recentKey, '[]'); } catch { /* Storage may be unavailable. */ }
  }

  function removeRecentTerm(termToRemove) {
    const next = recentTerms.filter((item) => item !== termToRemove);
    setRecentTerms(next);
    try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
  }

  return <div className="search-input-page">
    <PolicyAutocomplete value={term} onChange={setTerm} onSearch={submitSearch}
      onSelectTerm={submitSearch} onSelectPolicy={selectPolicy}
      liveSuggestions inlineSuggestions
      renderInput={(inputProps, submit) => <header className="search-header search-input-header">
        <div className="search-header-row">
          <h1>정책 찾기</h1>
          <div className="search-header-notification"><DrBuFaceButton /><NotificationBell onClick={() => navigate('/notifications')} /></div>
        </div>
        <form className="policy-search-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <SearchIcon />
          <input {...inputProps} ref={inputRef} autoFocus
            placeholder="정책명 또는 키워드를 입력해주세요" aria-label="정책 검색어" />
          {term && <button type="button" className="search-input-clear" aria-label="검색어 지우기"
            onClick={() => { setTerm(''); inputRef.current?.focus(); }}>×</button>}
          <button type="submit">검색</button>
        </form>
      </header>} />
    {!term.trim() && <div className="search-landing">
      <div className="search-landing-card">
        <section>
          <h2>카테고리로 둘러보기</h2>
          <div className="search-category-grid">
            {categoryItems.filter(({ label }) => (filters.data?.categories ?? []).some((category) => category.display_name === label))
              .map(({ label, Icon, color }) => <button type="button" className="search-category" key={label}
                onClick={() => browseCategory(label)}>
                <span className={`search-category-icon search-category-icon--${color}`}><Icon /></span>
                <span>{label}</span>
              </button>)}
          </div>
          {filters.isError && <p className="search-state search-state--error">카테고리를 불러오지 못했어요.</p>}
          {!user && <p className="search-state">로그인 후 정책을 검색할 수 있어요.</p>}
        </section>
      </div>
      <div className="search-landing-card">
        <section className="search-landing-section">
          <div className="search-section-heading">
            <h2>최근 검색어</h2>
            {recentTerms.length > 0 && <button type="button" onClick={clearRecentTerms}>전체 삭제</button>}
          </div>
          <div className="search-recent-list">
            {recentTerms.length === 0 && <p className="search-state">없음</p>}
            {recentTerms.slice(0, 3).map((recent, index) => <div className="search-recent-row" key={recent}>
              <button type="button" className="search-recent-open" onClick={() => submitSearch(recent)}>
                <ClockIcon />
                <span className="search-recent-term">{recent}</span>
                <span className="search-recent-date">{index === 0 ? '오늘' : index === 1 ? '어제' : '09.28'}</span>
              </button>
              <button type="button" className="search-recent-delete" aria-label={`최근 검색어 ${recent} 삭제`}
                onClick={() => removeRecentTerm(recent)}>×</button>
            </div>)}
          </div>
        </section>
      </div>
    </div>}
  </div>;
}
