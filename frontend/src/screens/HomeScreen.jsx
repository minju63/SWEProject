import { BottomNav } from '../components/PolicyLayout'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppState } from '../app/AppState'
import { policyCatalog } from '../data/policies'
export function Icon({ name, className = 'size-5' }) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    art: (
      <>
        <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.6-2-.5-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3Z" />
        <path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1M2 21h20" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 9h8M8 12h8M10 9l1.5 7M14 9l-1.5 7" />
      </>
    ),
    health: (
      <>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
        <path d="M12 9v5M9.5 11.5h5" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.12.37.34.7.6 1 .3.25.68.4 1.1.4h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.7.6Z" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4Z" />
        <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}
const categories = [
  { label: '취업·진로', icon: 'briefcase' },
  { label: '주거·생활', icon: 'home' },
  { label: '장학·금융', icon: 'coin' },
  { label: '문화·예술', icon: 'art' },
  { label: '복지·건강', icon: 'health' },
  { label: '공간·시설', icon: 'map' },
]
const policies = [policyCatalog[1], policyCatalog[4], policyCatalog[0]]
  .filter(Boolean)
  .map((policy) => ({
    id: policy.id,
    category: policy.category,
    title: policy.title,
    description: policy.description,
    location: policy.region,
    deadline: policy.deadline,
  }))
export default function HomeScreen() {
  const navigate = useNavigate()
  const { savedPolicies, profile, toggleSaved, addRecent } = useAppState()
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  function handleSearch(event) {
    event.preventDefault()
    setMessage(
      query.trim() ? `"${query.trim()}" 검색 결과예요.` : '지금 인기 있는 정책을 보여드려요.'
    )
    navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="app-shell relative mx-auto min-h-screen max-w-[480px] overflow-hidden bg-white text-[#171923] shadow-[0_0_40px_rgba(23,25,35,0.08)]">
        <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between bg-white/95 px-5 backdrop-blur-xl">
          <button className="flex items-center gap-2" aria-label="청년ZIP 홈">
            <span className="grid size-8 -rotate-6 place-items-center rounded-[11px] bg-[#2F7BF5] text-sm font-black text-white">
              Y
            </span>
            <span className="text-[18px] font-black tracking-[-0.05em]">청년ZIP</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/notifications')}
              className="relative rounded-full p-2.5 text-[#171923]"
              aria-label="알림"
            >
              <Icon name="bell" className="size-[22px]" />
              <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[#2F7BF5]" />
            </button>
            <button className="rounded-full p-2.5" aria-label="마이페이지">
              <Icon name="user" className="size-[22px]" />
            </button>
          </div>
        </header>

        <main className="pb-28">
          <section className="px-5 pb-6 pt-5">
            <p className="text-sm font-semibold text-black/60">안녕하세요, {profile.name}님</p>
            <h1 className="mt-1 text-[28px] font-black leading-[1.25] tracking-[-0.05em]">
              오늘은 어떤 기회를
              <br />
              찾고 있나요?
            </h1>

            <div
              className={`mt-6 overflow-hidden rounded-[20px] bg-[#f3f4f7] transition-all ${searchExpanded ? 'ring-2 ring-[#2F7BF5]' : ''}`}
            >
              <form onSubmit={handleSearch} className="flex h-14 items-center gap-3 px-4">
                <Icon name="search" className="size-[21px] shrink-0 text-black/60" />
                <input
                  value={query}
                  onFocus={() => setSearchExpanded(true)}
                  onClick={() => setSearchExpanded(true)}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:text-black/30"
                  placeholder="정책명이나 키워드를 검색해보세요"
                  aria-label="정책 검색어"
                  aria-expanded={searchExpanded}
                />
                <button className="rounded-xl bg-[#2F7BF5] px-4 py-2 text-xs font-extrabold text-white">
                  검색
                </button>
              </form>
              {searchExpanded && (
                <div className="border-t border-black/[0.06] bg-white p-3">
                  <p className="mb-2 px-1 text-[11px] font-bold text-black/60">
                    카테고리로 바로 찾기
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <button
                        key={category.label}
                        type="button"
                        onClick={() =>
                          navigate(`/search?category=${encodeURIComponent(category.label)}`)
                        }
                        className="flex items-center gap-1.5 rounded-full bg-[#f1f3fb] px-3 py-2 text-[11px] font-extrabold text-[#2468E0]"
                      >
                        <Icon name={category.icon} className="size-3.5" /> {category.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {message && (
              <p className="mt-3 px-1 text-xs font-bold text-[#2468E0]" role="status">
                {message}
              </p>
            )}
          </section>

          <section className="px-5 py-3">
            <button
              onClick={() => setMessage('맞춤추천 화면은 UI-04 단계에서 연결할게요.')}
              className="relative w-full overflow-hidden rounded-[24px] bg-[#2F7BF5] p-5 text-left text-white shadow-[0_12px_28px_rgba(102,120,200,0.18)]"
            >
              <span className="absolute -right-5 -top-9 size-32 rounded-full border-[22px] border-white/10" />
              <span className="absolute bottom-5 right-14 size-4 rotate-12 rounded bg-white/15" />
              <span className="relative grid size-9 place-items-center rounded-xl bg-white/15">
                <Icon name="sparkle" className="size-5" />
              </span>
              <p className="relative mt-4 text-lg font-black tracking-[-0.03em]">
                AI 맞춤 혜택 추천
              </p>
              <p className="relative mt-1 text-xs font-medium text-white/70">
                정책부터 문화행사, 가까운 시설까지 한 번에 추천해요
              </p>
              <span className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-extrabold">
                1분 만에 추천받기 <Icon name="arrow" className="size-4" />
              </span>
            </button>
          </section>

          <section className="py-7" aria-labelledby="deadline-title">
            <div className="flex items-end justify-between px-5">
              <div>
                <p className="mb-1 text-xs font-extrabold text-[#2468E0]">놓치기 전에 확인해요</p>
                <h2 id="deadline-title" className="text-xl font-black tracking-[-0.04em]">
                  마감 직전 혜택
                </h2>
              </div>
              <button
                onClick={() => navigate('/search')}
                className="text-xs font-bold text-black/60"
              >
                전체보기
              </button>
            </div>
            <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto px-5 pb-2">
              {[
                { day: 'D-5', title: '부산 청년 교통비 지원 (예시 정책)', category: '주거·생활' },
                {
                  day: 'D-7',
                  title: '사하구 청년 생활안정 지원사업 (예시 정책)',
                  category: '복지',
                },
                { day: '상시', title: '청년도약계좌', category: '장학·금융' },
              ].map((benefit) => (
                <button
                  key={benefit.title}
                  onClick={() =>
                    navigate(`/search?category=${encodeURIComponent(benefit.category)}`)
                  }
                  className="w-[190px] shrink-0 rounded-[20px] border border-black/[0.06] bg-[#f8f9fc] p-4 text-left"
                >
                  <span className="rounded-lg bg-[#2F7BF5] px-2 py-1 text-[10px] font-black text-white">
                    {benefit.day}
                  </span>
                  <p className="mt-4 text-sm font-black leading-snug">{benefit.title}</p>
                  <p className="mt-1 text-[11px] font-bold text-black/60">{benefit.category}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="px-5 pt-2" aria-labelledby="popular-title">
            <div className="flex items-end justify-between">
              <div>
                <p className="mb-1 text-xs font-extrabold text-[#2468E0]">
                  {profile.name}님의 지역과 관심사 기준
                </p>
                <h2 id="popular-title" className="text-xl font-black tracking-[-0.04em]">
                  맞춤 인기 정책
                </h2>
              </div>
              <button className="text-xs font-bold text-black/60">더보기</button>
            </div>

            <div className="mt-4 space-y-3">
              {policies.map((policy) => (
                <article
                  key={policy.title}
                  className="rounded-[22px] border border-black/[0.07] bg-white p-4 shadow-[0_5px_18px_rgba(23,25,35,0.045)]"
                >
                  <div className="flex gap-3.5">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f1f3fb] text-[#2468E0]">
                      {policy.category === '주거·생활' && <Icon name="home" className="size-6" />}
                      {policy.category === '취업·진로' && (
                        <Icon name="briefcase" className="size-6" />
                      )}
                      {policy.category === '장학·금융' && <Icon name="coin" className="size-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#2468E0]">
                        <span>{policy.category}</span>
                        <span className="text-black/15">·</span>
                        <span className="text-black/60">{policy.location}</span>
                      </div>
                      <h3 className="mt-1.5 text-[15px] font-black leading-snug tracking-[-0.025em]">
                        {policy.title}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-black/60">{policy.description}</p>
                    </div>
                    <button
                      onClick={() => toggleSaved(policy.id)}
                      className={`grid size-9 shrink-0 place-items-center rounded-full ${savedPolicies.includes(policy.id) ? 'bg-[#2F7BF5] text-white' : 'bg-[#f5f6f8] text-black/30'}`}
                      aria-label={`${policy.title} 저장`}
                    >
                      <Icon
                        name="heart"
                        className={`size-[18px] ${savedPolicies.includes(policy.id) ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-black/60">
                      <Icon name="calendar" className="size-3.5" />
                      {policy.deadline}
                    </span>
                    <button
                      onClick={() => {
                        addRecent(policy.id)
                        navigate(`/policies/${policy.id}`)
                      }}
                      className="flex items-center gap-1 text-[11px] font-extrabold text-[#2468E0]"
                    >
                      자세히 보기 <Icon name="arrow" className="size-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>

        <BottomNav active="홈" />
      </div>
    </div>
  )
}
