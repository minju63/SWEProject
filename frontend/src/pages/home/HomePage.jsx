import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHome } from '../../api/home';
import { addBookmark, removeBookmark } from '../../api/me';
import { useAuthStore } from '../../store/authStore';
import { useAssistantStore } from '../../store/assistantStore';
import { useToastStore } from '../../store/toastStore';
import PageHeader from '../../components/PageHeader.jsx';
import StateMessage from '../../components/StateMessage.jsx';
import { SearchIcon } from '../../components/icons.jsx';
import DonutChart from './DonutChart.jsx';
import HomePolicyCard from './HomePolicyCard.jsx';
import { CATEGORY_ORDER, CATEGORY_STYLE } from './homeConfig.js';
import CategoryIcon from './CategoryIcon.jsx';
import './home.css';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${WEEKDAY[d.getDay()]})`;
}

const STATUS_SHORT = { '대학생(휴학)': '휴학생', '대학생(재학)': '대학생' };

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const openChat = useAssistantStore((s) => s.openChat);
  const showToast = useToastStore((s) => s.show);
  const [scope, setScope] = useState('mine'); // mine | all (FR-H08)
  const [selected, setSelected] = useState(null); // 분야 이름 (FR-H09)
  const [query, setQuery] = useState('');

  const home = useQuery({ queryKey: ['home'], queryFn: fetchHome });

  const bookmark = useMutation({
    mutationFn: (policy) =>
      policy.bookmarked ? removeBookmark(policy.policy_id) : addBookmark(policy.policy_id, 'HOME'),
    onSuccess: (_, policy) => {
      queryClient.invalidateQueries({ queryKey: ['home'] });
      if (!policy.bookmarked) showToast('찜했어요! 캘린더에 마감일이 추가됐어요');
    },
    onError: (e) => showToast(e.message),
  });
  const toggleBookmark = (policy) => {
    if (!user) return showToast('로그인하면 찜할 수 있어요');
    bookmark.mutate(policy);
  };

  const data = home.data;
  const cats = data
    ? CATEGORY_ORDER.map((n) => data.categories.find((c) => c.category_name === n)).filter(Boolean)
    : [];
  const mineTotal = cats.reduce((s, c) => s + c.mine.total, 0); // 중앙 총 개수 = 분야 개수 합
  const selectedCat = cats.find((c) => c.category_name === selected);
  const p = data?.profile;

  const select = (name) => setSelected((cur) => (cur === name ? null : name));

  // 전체 보기: 공간·시설은 검색에서 빠지므로 지도 탭으로 (FR-H11)
  const goAll = (cat) => {
    if (cat.is_space) return navigate('/map');
    navigate(`/search?categoryId=${cat.category_id}${scope === 'mine' ? '&mine=1' : ''}`);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="home">
      <div className="home-hero">
        <PageHeader brand title="청해" subtitle="부산 청년 AI 생활·혜택 안내 서비스" />
        <svg className="hero-art" viewBox="0 0 200 90" aria-hidden="true">
          <path d="M0 80c30-8 40-30 70-30s30 22 60 22 50-30 70-30v38H0Z" fill="#cfe0fb" />
          <path d="M20 70c20-22 50-22 70 0" fill="none" stroke="#9db9ee" strokeWidth="2" />
          <rect x="150" y="22" width="5" height="48" rx="2" fill="#a9c3f2" />
          <rect x="165" y="40" width="8" height="30" rx="2" fill="#b9cff5" />
          <rect x="178" y="30" width="8" height="40" rx="2" fill="#b9cff5" />
        </svg>
      </div>

      {/* 검색창: 보이기만 한다. 포커스 확장(FR-H13)은 검색 담당과 합의 후 구현 */}
      <form className="home-search" onSubmit={submitSearch} role="search">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="정책명·키워드 검색 (예: 월세, 면접정장)"
          aria-label="정책 검색"
        />
      </form>

      <StateMessage isLoading={home.isLoading} error={home.error} />

      {data && (
        <>
          {/* 맞춤 그래프 + AI 맞춤 추천 */}
          <section className="graph-card">
            {!p.has_profile ? (
              <div className="graph-empty">
                <p>맞춤정보를 설정하면 나에게 맞는 혜택을 추천해 드려요</p>
                <Link to="/my" className="graph-set">
                  설정하기
                </Link>
              </div>
            ) : mineTotal === 0 ? (
              <p className="graph-zero">조건에 맞는 혜택이 아직 없어요</p>
            ) : (
              <>
                <div className="graph-wrap">
                  <DonutChart
                    segments={cats.map((c) => ({ name: c.category_name, count: c.mine.total }))}
                    selected={selected}
                    onSelect={select}
                    centerCount={selectedCat ? selectedCat.mine.total : mineTotal}
                    centerLabel={selectedCat ? selectedCat.category_name : '맞춤 혜택'}
                  />
                </div>
                <div className="graph-side">
                  <p className="graph-sentence">
                    {p.region_name && <b>{p.region_name}</b>}
                    {p.region_name && ' 거주'}
                    {p.age != null && (
                      <>
                        {' '}
                        <b>{p.age}세</b>
                      </>
                    )}
                    {p.current_status && ` ${STATUS_SHORT[p.current_status] ?? p.current_status}`}
                    {' 님을 위한'}
                    <br />
                    맞춤 혜택이에요!
                  </p>
                  {(!p.region_name || p.age == null || !p.current_status) && (
                    <Link to="/my" className="graph-hint">
                      프로필을 보완하면 더 정확해져요 ›
                    </Link>
                  )}
                  <button
                    type="button"
                    className="ai-pick"
                    onClick={() =>
                      openChat({ mode: 'recommend', categoryId: selectedCat?.category_id })
                    }
                  >
                    <span>✦ AI 맞춤 추천 ›</span>
                    <strong>
                      {data.top_picks.length ? data.top_picks.join(' / ') : '추천을 확인해 보세요'}
                    </strong>
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 카테고리로 둘러보기 */}
          <section className="home-section">
            <div className="home-section-head">
              <h2>카테고리로 둘러보기</h2>
              <div className="seg" role="tablist">
                {[
                  ['mine', '내 맞춤'],
                  ['all', '전체'],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={scope === v}
                    className={scope === v ? 'seg-on' : ''}
                    onClick={() => setScope(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cat-row">
              {cats.map((c) => {
                const st = CATEGORY_STYLE[c.category_name];
                const isSel = selected === c.category_name;
                return (
                  <button
                    key={c.category_id}
                    type="button"
                    className={`cat${isSel ? ' cat-on' : ''}${selected && !isSel ? ' cat-dim' : ''}`}
                    aria-pressed={isSel}
                    onClick={() => select(c.category_name)}
                  >
                    <span
                      className="cat-icon"
                      style={{
                        background: st.bg,
                        color: st.color,
                        borderColor: isSel ? st.color : 'transparent',
                      }}
                    >
                      <CategoryIcon name={c.category_name} />
                      <i className="cat-badge">{scope === 'mine' ? c.mine.total : c.all.total}</i>
                    </span>
                    <span className="cat-name">{c.category_name}</span>
                  </button>
                );
              })}
            </div>
            {scope === 'all' && (
              <p className="all-note">
                모집 중·상시 부산 청년 혜택 전체 {data.all_total}개 · 나에게 해당하지 않는 혜택도
                포함돼요
              </p>
            )}
          </section>

          {/* 분야 미리보기 (FR-H10) */}
          {!selectedCat ? (
            <p className="pick-hint">그래프나 카테고리를 눌러 분야별 혜택을 미리 보세요</p>
          ) : (
            <section className="home-section">
              <div className="home-section-head">
                <h2>
                  <i
                    className="dot"
                    style={{ background: CATEGORY_STYLE[selectedCat.category_name].color }}
                  />{' '}
                  {selectedCat.category_name} {scope === 'mine' ? '맞춤' : '전체'} 혜택{' '}
                  <span className="count-blue">{selectedCat[scope].total}</span>
                </h2>
                <button type="button" className="all-link" onClick={() => goAll(selectedCat)}>
                  전체 보기 ›
                </button>
              </div>
              {selectedCat.is_space ? (
                <p className="state">공간·시설은 지도 탭에서 확인할 수 있어요.</p>
              ) : selectedCat[scope].items.length === 0 ? (
                <p className="state">해당하는 혜택이 아직 없어요.</p>
              ) : (
                <>
                  <p className="sort-note">정렬 ① 신청 가능 › ② 마감 임박 › ③ 가나다</p>
                  {selectedCat[scope].items.map((policy) => (
                    <HomePolicyCard
                      key={policy.policy_id}
                      policy={policy}
                      onToggleBookmark={toggleBookmark}
                    />
                  ))}
                </>
              )}
            </section>
          )}

          {/* 찜한 정책 마감 임박 (FR-H03) */}
          {data.closing_bookmarks.length > 0 && (
            <section className="home-section">
              <div className="home-section-head">
                <h2>🔥 찜한 정책 마감 임박</h2>
                <Link to="/calendar" className="all-link">
                  2주 이내 · 캘린더 ›
                </Link>
              </div>
              <div className="closing-row">
                {data.closing_bookmarks.map((c) => (
                  <div key={c.policy_id} className="closing">
                    <div className="closing-top">
                      <span className="dtag">D-{c.d_day}</span>
                      <Link to={`/policies/${c.policy_id}`} className="closing-title">
                        {c.title}
                      </Link>
                      <button
                        type="button"
                        className="heart heart-on heart-sm"
                        aria-label="찜 해제"
                        onClick={() => toggleBookmark(c)}
                      >
                        ♥
                      </button>
                    </div>
                    <p className="closing-meta">
                      {shortDate(c.application_end_date)}
                      {c.region_names[0] && ` · ${c.region_names[0]}`}
                      {c.docs_total > 0 && (
                        <b className="docs">
                          {' '}
                          서류 {c.docs_checked}/{c.docs_total}
                        </b>
                      )}
                    </p>
                    {c.docs_total > 0 && (
                      <div className="bar">
                        <i style={{ width: `${(c.docs_checked / c.docs_total) * 100}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
