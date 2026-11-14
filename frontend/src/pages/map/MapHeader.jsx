// 지도 헤더: 제목, 장소 검색(제안 최대 20곳, Enter 로 결과 목록), 필터 버튼, 알림 (FR-MAP-021·022·023)
// 검색어는 기기 안에서만 처리하고 서버로 보내지 않는다.
// 팀 공통 헤더 버튼(알림, Dr.부 숨김 시 얼굴 버튼 FR-A06)은 맨 끝 NotificationBell 옆에 둔다.
// 검색창이 남는 폭을 차지하므로 버튼이 늘면 검색창이 줄어든다.
import { useMemo, useState } from 'react';
import NotificationBell from '../../components/NotificationBell.jsx';
import { CategoryBadge, Glyph } from './mapIcons.jsx';
import { placeMatchesTerm } from './mapUtils.js';

export default function MapHeader({
  places,
  allowedIds,
  onPick,
  filterCount,
  onFilter,
  searchTerm,
  onSearchTerm,
  initialQuery = '',
  initialResults = false,
}) {
  // 다른 화면에서 검색어를 받아 열리면(FR-MAP-028) 검색창에 넣고, 여러 곳이 맞으면 결과 목록을 연다
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(initialResults);
  const q = query.trim();

  const hits = useMemo(() => {
    if (!q) return [];
    return places
      .filter((place) => allowedIds.has(place.id) && placeMatchesTerm(place, q))
      .slice(0, 20)
      .map((place) => ({
        key: place.id,
        place,
        title: place.name,
        sub: `${place.categoryName} · ${place.district}`,
      }));
  }, [q, places, allowedIds]);

  function pick(hit) {
    onPick(hit.place);
    setOpen(false);
    setResultsOpen(false);
    if (!searchTerm) setQuery('');
  }

  function submit() {
    if (hits.length === 1) {
      onSearchTerm('');
      pick(hits[0]);
      setQuery('');
    } else if (hits.length > 1) {
      onSearchTerm(q);
      setOpen(false);
      setResultsOpen(true);
    }
  }

  return (
    <div className="relative flex h-[68px] items-center gap-2.5 px-5">
      <h1 className="shrink-0 text-[20px] font-black tracking-[-0.04em]">지도</h1>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={onFilter}
          aria-label="필터"
          className="absolute left-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full text-black/60"
        >
          <Glyph name="filter" className="size-5" strokeWidth={2} />
          {filterCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#2F7BF5] px-1 text-[10px] font-black leading-4 text-white">
              {filterCount}
            </span>
          )}
        </button>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) onSearchTerm('');
            setOpen(true);
            setResultsOpen(false);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="장소 검색"
          aria-label="장소 검색"
          className="h-11 w-full rounded-full bg-[#f0f1f5] pl-11 pr-4 text-[14px] font-semibold outline-none placeholder:text-black/35 focus:ring-2 focus:ring-[#2F7BF5]"
        />
        {open && q && (
          <>
            <button
              type="button"
              aria-label="검색 제안 닫기"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <ul className="absolute inset-x-0 top-12 z-50 max-h-[50vh] overflow-y-auto rounded-2xl bg-white py-1 shadow-[0_8px_28px_rgba(23,25,35,0.18)]">
              {hits.length === 0 && (
                <li className="px-4 py-3 text-[13px] font-medium text-black/45">
                  검색 결과가 없어요
                </li>
              )}
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
                  >
                    <CategoryBadge
                      kind={hit.place.category}
                      color={hit.place.color}
                      className="size-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold">{hit.title}</span>
                      <span className="block truncate text-[12px] font-medium text-black/50">
                        {hit.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {resultsOpen && q && hits.length > 1 && (
        <div className="absolute inset-x-0 top-full z-50 h-[calc(100dvh-68px)] bg-black/30">
          <div className="flex max-h-[75%] flex-col rounded-b-3xl bg-white shadow-[0_8px_28px_rgba(23,25,35,0.18)]">
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-[15px] font-black">
                &lsquo;{q}&rsquo; 검색 결과 {hits.length}건
              </h2>
              <button
                type="button"
                onClick={() => setResultsOpen(false)}
                aria-label="검색 결과 닫기"
                className="grid size-9 place-items-center text-black/40"
              >
                <Glyph name="close" className="size-5" />
              </button>
            </div>
            <ul className="overflow-y-auto pb-2">
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    className="flex w-full items-center gap-3 border-b border-black/[0.05] px-5 py-3 text-left"
                  >
                    <CategoryBadge
                      kind={hit.place.category}
                      color={hit.place.color}
                      className="size-11 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold">{hit.title}</span>
                      <span className="block truncate text-[12px] font-medium text-black/50">
                        {hit.sub}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            aria-label="검색 결과 닫기"
            className="block h-full w-full cursor-default"
            onClick={() => setResultsOpen(false)}
          />
        </div>
      )}
      <NotificationBell />
    </div>
  );
}
