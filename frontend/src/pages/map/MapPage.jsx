// 지도 탭 (김대환). Figma MapScreen.tsx 를 옮기고, 가짜 데이터·가짜 위치를 API·브라우저 위치로 바꿨다.
// 기준: SRS v0.6 FR-MAP-001~028, SDD COMP-MAP-01~08
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPlaces } from '../../api/places';
import { fetchProfile } from '../../api/me';
import { useAuthStore } from '../../store/authStore';
import KakaoMap, { MAX_ZOOM, MIN_ZOOM } from './KakaoMap.jsx';
import MapHeader from './MapHeader.jsx';
import MapFilterSheet from './MapFilterSheet.jsx';
import { ChipBar, PlaceDetail, PlaceRow, PlaceSummary } from './MapParts.jsx';
import { Glyph } from './mapIcons.jsx';
import { useUserLocation } from './useUserLocation.js';
import {
  centerOf,
  distanceMeters,
  districtsOf,
  insideArea,
  isOpenNow,
  matchesFee,
  placeMatchesTerm,
  serviceArea,
  toPlace,
} from './mapUtils.js';
import './map.css';

const STOPS = ['collapsed', 'mid', 'full'];
const COLLAPSED_HEIGHT = 88;
const BAR_HEIGHT = 56;
const CARD_HEIGHT = 244;
const START_ZOOM = 2; // 거주 구 중심으로 열 때
const FOCUS_ZOOM = START_ZOOM + 1; // 장소·내 위치로 옮길 때
const BUSAN_CITY_HALL = { lat: 35.1798, lng: 129.075 }; // 장소를 못 불러왔을 때만 쓰는 기본 중심
const OUTSIDE_NOTICE = '서비스 지역(사하구·부산진구) 밖이에요';
const LOGIN_NOTICE = '찜은 로그인 후 사용할 수 있어요';

function sheetHeights(regionHeight) {
  const full = Math.max(regionHeight - BAR_HEIGHT, COLLAPSED_HEIGHT + 160);
  const mid = Math.min(Math.max(Math.round(regionHeight * 0.46), 230), full - 60);
  return { collapsed: COLLAPSED_HEIGHT, mid, full };
}

export default function MapPage() {
  const { search, key: navKey } = useLocation();
  const user = useAuthStore((s) => s.user);
  // 마이 탭 정보 중 거주 구만 읽는다 (FR-MY-017, NFR-MAP-011)
  const homeRegion = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    enabled: !!user,
    select: (profile) => profile?.region_code ?? null,
  });

  const placesQuery = useQuery({ queryKey: ['places'], queryFn: fetchPlaces });
  const loadError = !!placesQuery.error;
  const places = useMemo(() => (placesQuery.data?.items ?? []).map(toPlace), [placesQuery.data]);
  // 장소가 0곳인 카테고리는 칩에서 숨긴다 (FR-MAP-004)
  const categories = useMemo(
    () =>
      (placesQuery.data?.categories ?? [])
        .filter((c) => places.some((p) => p.category === c.category_code))
        .map((c) => ({ code: c.category_code, label: c.category_name, color: c.color })),
    [placesQuery.data, places]
  );
  const districtOptions = useMemo(() => districtsOf(places), [places]);
  const area = useMemo(() => serviceArea(places), [places]);

  // ---------- 화면 상태 ----------
  const [notice, setNotice] = useState('');
  const [dismissed, setDismissed] = useState(null);
  const [category, setCategory] = useState('all');
  const [fee, setFee] = useState('all');
  const [openNow, setOpenNow] = useState(false);
  const [radius, setRadius] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [reservableOnly, setReservableOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [sheet, setSheet] = useState('mid');
  const [regionHeight, setRegionHeight] = useState(560);
  // null: 아직 아무도 지도를 옮기지 않음 → 기본 중심(거주 구)을 따라간다
  const [viewportState, setViewport] = useState(null);
  const [headerKey, setHeaderKey] = useState(0);
  const [appliedNav, setAppliedNav] = useState(null);
  const [mapStarted, setMapStarted] = useState(false);
  const regionRef = useRef(null);
  const listRef = useRef(null);
  const cardRefs = useRef({});
  const handleStart = useRef(null);

  // 다른 화면에서 넘긴 조건으로 연다 (FR-MAP-028). 지도 탭에 있을 때 다시 넘어와도 주소가 바뀔 때마다 적용한다
  if (placesQuery.isSuccess && appliedNav !== navKey) {
    setAppliedNav(navKey);
    applyEntry(new URLSearchParams(search));
  }

  // 지도는 첫 중심을 정할 수 있을 때(장소, 로그인했으면 거주 구까지) 만든다
  const waitingProfile = !!user && homeRegion.isLoading;
  if (!mapStarted && (placesQuery.isSuccess || loadError) && !waitingProfile) setMapStarted(true);

  // ---------- 위치 (메모리에만 둔다) ----------
  const latest = useRef({ area });
  useLayoutEffect(() => {
    latest.current = { area };
  });
  const location = useUserLocation({
    onLocated: (pos, request) => {
      if (!insideArea(latest.current.area, pos)) {
        setNotice(OUTSIDE_NOTICE);
        return;
      }
      // 버튼으로 요청했거나 아직 아무도 지도를 옮기지 않았을 때만 내 위치로 옮긴다
      const force = !!request?.byUser;
      if (force) setSelectedId(null);
      setViewport((cur) =>
        cur && !force ? cur : { ...pos, zoom: Math.max(cur?.zoom ?? START_ZOOM, FOCUS_ZOOM) }
      );
    },
  });
  const myLocation =
    location.status === 'ok' && insideArea(area, location.position) ? location.position : null;

  // 초기 중심: 내 위치(onLocated) → 거주 구 장소 평균 → 전체 장소 평균 (FR-MAP-005)
  const defaultView = useMemo(() => {
    const home = centerOf(places.filter((p) => p.regionCode === homeRegion.data));
    if (home) return { ...home, zoom: START_ZOOM };
    // 거주 구를 모르면(비로그인) 두 구가 다 보이게 넓게 연다
    return { ...(centerOf(places) ?? BUSAN_CITY_HALL), zoom: MIN_ZOOM };
  }, [places, homeRegion.data]);
  const viewport = viewportState ?? defaultView;

  const searchablePlaces = useMemo(() => {
    if (loadError) return [];
    return places.filter(
      (place) =>
        (category === 'all' || place.category === category) &&
        matchesFee(place, fee) &&
        (!openNow || isOpenNow(place)) &&
        (districts.length === 0 || districts.includes(place.district)) &&
        (!reservableOnly || !!place.reservationUrl) &&
        (!savedOnly || saved.includes(place.id))
    );
  }, [places, loadError, category, fee, openNow, districts, reservableOnly, savedOnly, saved]);

  // 거리순(위치 있음) 또는 이름순 (FR-MAP-007·008), 반경 (FR-MAP-025)
  const visiblePlaces = useMemo(() => {
    const list = searchablePlaces
      .filter((place) => placeMatchesTerm(place, searchTerm))
      .map((place) => ({ place, distance: myLocation ? distanceMeters(myLocation, place) : null }))
      .filter(({ distance }) => radius === null || distance === null || distance <= radius);
    list.sort((a, b) =>
      a.distance !== null && b.distance !== null
        ? a.distance - b.distance
        : a.place.name.localeCompare(b.place.name, 'ko')
    );
    return list;
  }, [searchablePlaces, searchTerm, radius, myLocation]);

  const markers = useMemo(
    () =>
      visiblePlaces.map(({ place }) => ({
        id: place.id,
        lat: place.lat,
        lng: place.lng,
        label: place.name,
        color: place.color,
        kind: place.category,
        saved: saved.includes(place.id),
      })),
    [visiblePlaces, saved]
  );

  const allowedIds = useMemo(() => new Set(searchablePlaces.map((p) => p.id)), [searchablePlaces]);
  const heights = sheetHeights(regionHeight);
  const selectedPlace = selectedId ? (places.find((p) => p.id === selectedId) ?? null) : null;
  const cardMode = selectedPlace !== null;
  const sheetHeight = cardMode ? CARD_HEIGHT : heights[sheet];
  const bottomInset = cardMode ? CARD_HEIGHT : Math.min(heights[sheet], heights.mid);
  const detailPlace = detailId ? (places.find((p) => p.id === detailId) ?? null) : null;
  const distanceTo = (place) => (myLocation ? distanceMeters(myLocation, place) : null);

  useLayoutEffect(() => {
    const el = regionRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setRegionHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 고른 장소가 목록에서 보이게 스크롤
  useEffect(() => {
    if (!selectedId || sheet === 'collapsed') return;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      const card = cardRefs.current[selectedId];
      if (!list || !card) return;
      const top = card.offsetTop - 8;
      const bottom = card.offsetTop + card.offsetHeight + 16;
      if (top < list.scrollTop) list.scrollTo({ top, behavior: 'smooth' });
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [selectedId, sheet]);

  // place: 장소 번호(place_id) 또는 장소 키, category: 카테고리 코드, q: 검색어
  function applyEntry(params) {
    const key = params.get('place');
    const code = params.get('category');
    const q = params.get('q')?.trim() ?? '';
    if (!key && !code && !q) return;
    resetFilter();
    setDetailId(null);
    setHeaderKey((k) => k + 1);
    const place = key ? places.find((p) => p.id === key || p.key === key) : null;
    if (key && !place) setNotice('장소 정보를 찾을 수 없어요');
    setSelectedId(place?.id ?? null);
    setSearchTerm(place ? '' : q);
    if (place) setViewport({ lat: place.lat, lng: place.lng, zoom: FOCUS_ZOOM });
    else if (categories.some((c) => c.code === code)) setCategory(code);
  }

  // 목록 줄(PlaceRow)에 넘기는 함수는 값이 바뀔 때만 새로 만든다 → 바뀌지 않은 줄은 다시 그리지 않는다
  const focusOn = useCallback(
    ({ lat, lng }) =>
      setViewport((cur) => ({ lat, lng, zoom: Math.max((cur ?? defaultView).zoom, FOCUS_ZOOM) })),
    [defaultView]
  );

  const selectFromCard = useCallback(
    (place) => {
      setSelectedId(place.id);
      focusOn(place);
    },
    [focusOn]
  );

  function selectFromMarker(id) {
    setSelectedId(id);
    const place = id ? places.find((p) => p.id === id) : null;
    if (place) focusOn(place);
  }

  // 찜 (P2): 아직 서버 저장 없음. 로그인 확인 후 이 화면 안에서만 유지 (FR-MAP-018~020)
  const toggleSaved = useCallback(
    (id) => {
      if (!user) {
        setNotice(LOGIN_NOTICE);
        return;
      }
      const wasSaved = saved.includes(id);
      setSaved(wasSaved ? saved.filter((x) => x !== id) : [...saved, id]);
      setNotice(wasSaved ? '찜을 해제했어요' : '찜했어요');
    },
    [user, saved]
  );

  const registerCard = useCallback((id, el) => {
    if (el) cardRefs.current[id] = el;
    else delete cardRefs.current[id];
  }, []);

  function toggleSavedOnly() {
    if (!user) {
      setNotice(LOGIN_NOTICE);
      return;
    }
    setSavedOnly((v) => !v);
    setSelectedId(null);
    listRef.current?.scrollTo({ top: 0 });
  }

  function changeFee(next) {
    setFee(next);
    if (selectedPlace && !matchesFee(selectedPlace, next)) setSelectedId(null);
    listRef.current?.scrollTo({ top: 0 });
  }

  function changeCategory(code) {
    setCategory(code);
    if (selectedPlace && code !== 'all' && selectedPlace.category !== code) setSelectedId(null);
    listRef.current?.scrollTo({ top: 0 });
  }

  function zoom(delta) {
    setViewport((cur) => {
      const base = cur ?? defaultView;
      return { ...base, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.zoom + delta)) };
    });
  }

  function moveSheet(direction) {
    const index = STOPS.indexOf(sheet);
    setSheet(STOPS[Math.min(STOPS.length - 1, Math.max(0, index + direction))]);
  }

  // 시트 손잡이: 24px 이상 밀면 한 단계, 짧게 누르면 순환 (FR-MAP-009)
  function onHandleDown(event) {
    handleStart.current = { y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onHandleUp(event) {
    const start = handleStart.current;
    handleStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const delta = event.clientY - start.y;
    if (delta <= -24) moveSheet(1);
    else if (delta >= 24) moveSheet(-1);
    else if (Math.abs(delta) < 8)
      setSheet(sheet === 'collapsed' ? 'mid' : sheet === 'mid' ? 'full' : 'mid');
  }
  function onHandleKey(event) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSheet(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSheet(-1);
    }
  }

  const requestLocation = () => location.locate({ byUser: true });

  // 내 위치 버튼 (FR-MAP-006)
  function locateMe() {
    if (myLocation) {
      setSelectedId(null);
      focusOn(myLocation);
    } else if (location.status === 'ok') {
      setNotice(OUTSIDE_NOTICE);
    } else {
      requestLocation();
    }
  }

  function resetFilter() {
    setCategory('all');
    setFee('all');
    setOpenNow(false);
    setRadius(null);
    setDistricts([]);
    setReservableOnly(false);
    setSavedOnly(false);
  }

  // 위치 안내 배너 (FR-MAP-016, NFR-MAP-008)
  const banner =
    location.status === 'prompt'
      ? {
          key: 'prompt',
          text: '가까운 순으로 보여주려고 현재 위치를 사용해요',
          action: '위치 사용',
          onAction: requestLocation,
          closeLabel: '나중에',
          onClose: location.skip,
        }
      : location.status === 'denied'
        ? {
            key: 'denied',
            text: '위치 권한이 꺼져 있어요. 켜면 가까운 순으로 볼 수 있어요',
            action: '권한 켜는 방법',
            onAction: () => setNotice('주소창 왼쪽 사이트 설정에서 위치를 허용해 주세요'),
          }
        : location.status === 'failed'
          ? {
              key: 'failed',
              text: '현재 위치를 가져오지 못했어요',
              action: '다시 시도',
              onAction: requestLocation,
            }
          : null;
  const showBanner = banner && dismissed !== banner.key;
  const controlsHidden = !cardMode && sheet === 'full';
  const filterCount =
    (category !== 'all' ? 1 : 0) +
    (fee !== 'all' ? 1 : 0) +
    (openNow ? 1 : 0) +
    (radius !== null ? 1 : 0) +
    districts.length +
    (reservableOnly ? 1 : 0);
  const listTitle =
    loadError || placesQuery.isLoading
      ? '주변 장소'
      : `${savedOnly ? '찜한 장소' : myLocation ? '주변 장소' : '장소'} ${visiblePlaces.length}곳`;

  return (
    <div className="map-root">
      <header className="relative z-[60] shrink-0 border-b border-black/[0.05] bg-white/95 backdrop-blur-xl">
        <MapHeader
          key={headerKey}
          places={places}
          allowedIds={allowedIds}
          onPick={selectFromCard}
          filterCount={filterCount}
          onFilter={() => setFilterOpen(true)}
          searchTerm={searchTerm}
          onSearchTerm={setSearchTerm}
        />
      </header>

      <main ref={regionRef} className="relative min-h-0 flex-1 overflow-hidden">
        {mapStarted ? (
          <KakaoMap
            viewport={viewport}
            onViewportChange={setViewport}
            markers={markers}
            selectedId={selectedId}
            onSelectMarker={selectFromMarker}
            myLocation={myLocation}
            bottomInset={bottomInset}
            topInset={BAR_HEIGHT}
          />
        ) : (
          <div className="absolute inset-0 z-0 bg-[#eceef4]" />
        )}

        {!loadError && (
          <ChipBar
            categories={categories}
            category={category}
            onCategory={changeCategory}
            fee={fee}
            onFee={changeFee}
            height={BAR_HEIGHT}
          />
        )}

        {showBanner && (
          <section
            aria-label="위치 안내"
            className="absolute inset-x-2.5 z-[25] flex items-center gap-2.5 rounded-xl bg-white py-2.5 pl-3.5 pr-1.5 shadow-[0_6px_20px_rgba(23,25,35,0.14)]"
            style={{ top: BAR_HEIGHT }}
          >
            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-black/75">
              {banner.text}
            </p>
            <button
              type="button"
              onClick={banner.onAction}
              className="shrink-0 rounded-lg border border-[#6678c8] px-2.5 py-1.5 text-xs font-extrabold text-[#6678c8]"
            >
              {banner.action}
            </button>
            {banner.closeLabel ? (
              <button
                type="button"
                onClick={banner.onClose}
                className="shrink-0 px-2 py-1.5 text-xs font-extrabold text-black/40"
              >
                {banner.closeLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDismissed(banner.key)}
                aria-label="안내 닫기"
                className="grid size-10 shrink-0 place-items-center text-black/40"
              >
                <Glyph name="close" className="size-4" />
              </button>
            )}
          </section>
        )}

        {notice && (
          <div
            role="status"
            className="absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#171923]/90 px-4 py-2 text-xs font-bold text-white shadow-lg"
            style={{ bottom: sheetHeight + 16 }}
          >
            {notice}
          </div>
        )}

        <div
          aria-hidden={controlsHidden}
          className={`absolute right-3 z-20 flex flex-col gap-2 transition-[opacity,bottom] duration-200 ${
            controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          style={{ bottom: sheetHeight + 12 }}
        >
          <button
            type="button"
            onClick={toggleSavedOnly}
            aria-pressed={savedOnly}
            aria-label={savedOnly ? '찜한 장소만 보기 해제' : '찜한 장소만 보기'}
            className={`relative grid size-11 place-items-center rounded-full shadow-[0_2px_10px_rgba(23,25,35,0.2)] transition ${
              savedOnly ? 'bg-[#e5445f] text-white' : 'bg-white text-[#e5445f]'
            }`}
          >
            <Glyph name="heart" className={`size-5 ${savedOnly ? 'fill-current' : ''}`} />
            {saved.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-[1.5px] border-[#e5445f] bg-white px-1 text-[11px] font-extrabold leading-none text-[#e5445f]">
                {saved.length}
              </span>
            )}
          </button>
          {[
            {
              label: '지도 확대',
              icon: 'plus',
              onClick: () => zoom(1),
              disabled: viewport.zoom >= MAX_ZOOM,
            },
            {
              label: '지도 축소',
              icon: 'minus',
              onClick: () => zoom(-1),
              disabled: viewport.zoom <= MIN_ZOOM,
            },
            {
              label: myLocation ? '내 위치로 이동' : '위치 다시 요청',
              icon: myLocation ? 'locate' : 'locateOff',
              onClick: locateMe,
              disabled: false,
            },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              disabled={b.disabled}
              aria-label={b.label}
              className="grid size-11 place-items-center rounded-full bg-white text-black/70 shadow-[0_2px_10px_rgba(23,25,35,0.2)] disabled:text-black/20"
            >
              <Glyph name={b.icon} className="size-5" />
            </button>
          ))}
        </div>

        <section
          aria-label="장소 목록"
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_-8px_32px_rgba(23,25,35,0.16)] transition-[height] duration-200 ease-out"
          style={{ height: sheetHeight }}
        >
          {selectedPlace ? (
            <>
              <span className="mx-auto mb-3 mt-2.5 block h-1 w-10 shrink-0 rounded-full bg-black/15" />
              <PlaceSummary
                place={selectedPlace}
                distance={distanceTo(selectedPlace)}
                saved={saved.includes(selectedPlace.id)}
                onToggleSaved={() => toggleSaved(selectedPlace.id)}
                onOpen={() => setDetailId(selectedPlace.id)}
                onClose={() => setSelectedId(null)}
              />
            </>
          ) : (
            <>
              <div
                role="slider"
                tabIndex={0}
                aria-label="장소 목록 높이 조절"
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={STOPS.indexOf(sheet)}
                aria-valuetext={sheet === 'collapsed' ? '접힘' : sheet === 'mid' ? '중간' : '전체'}
                onPointerDown={onHandleDown}
                onPointerUp={onHandleUp}
                onPointerCancel={() => (handleStart.current = null)}
                onKeyDown={onHandleKey}
                className="shrink-0 cursor-grab touch-none select-none px-5 pb-3 pt-2.5"
              >
                <span className="mx-auto block h-1 w-10 rounded-full bg-black/15" />
                <div className="mt-3.5 flex items-center justify-between">
                  <h2 className="text-[15px] font-black tracking-[-0.03em]">{listTitle}</h2>
                  {!loadError && !placesQuery.isLoading && (
                    <span className="text-[12px] font-bold text-black/40">
                      {myLocation ? '거리순' : '이름순'}
                    </span>
                  )}
                </div>
              </div>

              <div
                ref={listRef}
                className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-black/[0.06]"
              >
                {placesQuery.isLoading && (
                  <p className="px-6 py-10 text-center text-[13px] font-medium text-black/40">
                    불러오는 중…
                  </p>
                )}
                {loadError && (
                  <EmptyState
                    title="장소를 불러오지 못했어요"
                    action="다시 시도"
                    onAction={() => placesQuery.refetch()}
                  />
                )}
                {!loadError && !placesQuery.isLoading && visiblePlaces.length === 0 && (
                  <EmptyState
                    title={
                      savedOnly && saved.length === 0
                        ? '찜한 장소가 없어요'
                        : '조건에 맞는 장소가 없어요'
                    }
                    action={savedOnly && saved.length === 0 ? '전체 보기' : '필터 초기화'}
                    onAction={() => {
                      resetFilter();
                      setSearchTerm('');
                      setHeaderKey((k) => k + 1);
                    }}
                  />
                )}
                {visiblePlaces.map(({ place, distance }) => (
                  <PlaceRow
                    key={place.id}
                    place={place}
                    distance={distance}
                    selected={place.id === selectedId}
                    saved={saved.includes(place.id)}
                    onSelect={selectFromCard}
                    onToggleSaved={toggleSaved}
                    registerCard={registerCard}
                  />
                ))}
                {!placesQuery.isLoading && !loadError && (
                  <p className="px-5 pb-5 pt-3 text-center text-[10px] font-medium text-black/25">
                    찜은 아직 이 화면을 나가면 초기화돼요.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        {detailPlace && (
          <PlaceDetail
            place={detailPlace}
            distance={distanceTo(detailPlace)}
            saved={saved.includes(detailPlace.id)}
            onToggleSaved={() => toggleSaved(detailPlace.id)}
            onClose={() => setDetailId(null)}
          />
        )}
      </main>

      {filterOpen && (
        <MapFilterSheet
          categories={categories}
          category={category}
          onCategory={changeCategory}
          fee={fee}
          onFee={changeFee}
          openNow={openNow}
          onOpenNow={setOpenNow}
          radius={radius}
          onRadius={setRadius}
          hasLocation={!!myLocation}
          districtOptions={districtOptions}
          districts={districts}
          onDistricts={setDistricts}
          reservableOnly={reservableOnly}
          onReservableOnly={setReservableOnly}
          count={visiblePlaces.length}
          onReset={resetFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ title, action, onAction }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[14px] font-black tracking-[-0.03em]">{title}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 rounded-lg border border-[#6678c8] px-4 py-2 text-[13px] font-extrabold text-[#6678c8]"
      >
        {action}
      </button>
    </div>
  );
}
