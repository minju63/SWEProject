import { useState } from 'react'
import { AppShell, BottomNav, ScreenHeader } from '../components/PolicyLayout'
import { catalogEvents } from '../data/catalog'
import { safeOfficialUrl } from '../data/housing'
export default function CultureEventsScreen() {
  const [query, setQuery] = useState(''),
    [domain, setDomain] = useState('ALL')
  const events = catalogEvents.filter(
    (e) => e.title.includes(query.trim()) && (domain === 'ALL' || e.collection_domain === domain)
  )
  return (
    <AppShell>
      <ScreenHeader title="문화행사" />
      <main className="px-5 pt-5 pb-28">
        <p className="mb-4 text-xs text-black/60">
          공유 DB에서 불러온 공연·전시·행사 {catalogEvents.length}건이에요.
        </p>
        <input
          aria-label="문화행사 검색"
          placeholder="공연·전시·행사 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-5 w-full rounded-xl border border-black/10 bg-white p-3 text-sm"
        />
        <div className="mb-4 flex gap-2">
          {[
            ['ALL', '??'],
            ['CULTURE', '??'],
            ['JOB', '??'],
            ['HOUSING', '??'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setDomain(id)}
              aria-pressed={domain === id}
              className={`rounded-full px-3 py-2 text-xs font-bold ${domain === id ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/60'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {events.map((e) => {
            const detail = Array.isArray(e.culture_detail) ? e.culture_detail[0] : e.culture_detail
            const url = safeOfficialUrl(e.official_url || detail?.reservation_url)
            return (
              <article key={e.policy_id} className="rounded-2xl bg-white p-4">
                <span className="text-xs font-bold text-[#2468E0]">문화행사</span>
                <h2 className="mt-1 text-base font-bold">{e.title}</h2>
                <p className="mt-2 text-xs leading-5 text-black/60">
                  {detail?.venue_text || '장소는 공식 안내를 확인해주세요.'}
                </p>
                <p className="mt-1 text-xs text-black/60">
                  {detail?.event_start_at?.slice(0, 10) || '시작일 확인 필요'} ~{' '}
                  {detail?.event_end_at?.slice(0, 10) || '종료일 확인 필요'}
                </p>
                {detail?.schedule_text && (
                  <p className="mt-2 text-xs text-black/60">{detail.schedule_text}</p>
                )}
                {url && (
                  <a
                    className="mt-3 inline-block text-xs font-bold text-[#2468E0]"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    공식 안내 보기 ↗
                  </a>
                )}
              </article>
            )
          })}
        </div>
      </main>
      <BottomNav active="검색" />
    </AppShell>
  )
}
