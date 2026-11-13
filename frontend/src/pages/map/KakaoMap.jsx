import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadKakaoMaps } from './kakaoLoader.js';
import { CategoryBadge, CategoryPin } from './mapIcons.jsx';

/*
 * 카카오맵 JavaScript SDK 지도 (Figma PlaceMap.tsx 와 같은 props).
 * - 카카오는 지도 그림·좌표 변환만 맡고, 마커·클러스터·말풍선은 이 컴포넌트가 지도 위 층에 그린다.
 *   (클러스터는 카카오 결과가 아니라 우리 DB 좌표로 만든다: FR-MAP-003)
 * - 지도 영역은 하단 시트 위까지만 둔다 → 카카오 로고·저작권 표기가 가려지지 않는다 (NFR-MAP-022).
 * - viewport.level 은 Figma 단계(-1 가장 넓게 ~ 6 가깝게). 카카오 레벨 = 8 - 단계.
 */
export const MAP_MIN_LEVEL = -1; // 한 단계 더 넓게: 작은 화면에서도 두 구가 다 보이게
export const MAP_MAX_LEVEL = 6;
const KAKAO_LEVEL_BASE = 8;
const CLUSTER_RADIUS = 46; // 화면 중심 간격 46px 미만이면 묶는다 (FR-MAP-003)

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toKakaoLevel = (level) => KAKAO_LEVEL_BASE - clamp(level, MAP_MIN_LEVEL, MAP_MAX_LEVEL);
const fromKakaoLevel = (kl) => clamp(KAKAO_LEVEL_BASE - kl, MAP_MIN_LEVEL, MAP_MAX_LEVEL);

export default function KakaoMap({
  viewport,
  onViewportChange,
  markers,
  selectedId,
  onSelectMarker,
  myLocation,
  bottomInset = 0,
  topInset = 0,
  interactive = true,
}) {
  const rootRef = useRef(null);
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [, setFrame] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [popup, setPopup] = useState(null);
  const latest = useRef({ viewport, onViewportChange, onSelectMarker, topInset });
  useLayoutEffect(() => {
    latest.current = { viewport, onViewportChange, onSelectMarker, topInset };
  });

  // 보이는 영역(상단 칩 줄 아래)의 가운데를 viewport 중심으로 맞춘다
  const shiftOf = () => latest.current.topInset / 2;

  // 지도 만들기
  useEffect(() => {
    let cancelled = false;
    let observer = null;
    loadKakaoMaps()
      .then((kakao) => {
        const el = rootRef.current;
        if (cancelled || !el) return;
        const vp = latest.current.viewport;
        const m = new kakao.maps.Map(el, {
          center: new kakao.maps.LatLng(vp.lat, vp.lng),
          level: toKakaoLevel(vp.level),
        });
        m.setMinLevel(toKakaoLevel(MAP_MAX_LEVEL));
        m.setMaxLevel(toKakaoLevel(MAP_MIN_LEVEL));
        let raf = 0;
        const redraw = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => setFrame((n) => n + 1));
        };
        for (const type of ['center_changed', 'zoom_changed', 'bounds_changed', 'drag'])
          kakao.maps.event.addListener(m, type, redraw);
        kakao.maps.event.addListener(m, 'zoom_changed', () => setPopup(null));
        kakao.maps.event.addListener(m, 'click', () => {
          setPopup(null);
          latest.current.onSelectMarker(null);
        });
        kakao.maps.event.addListener(m, 'idle', () => {
          const box = el.getBoundingClientRect();
          const target = m
            .getProjection()
            .coordsFromContainerPoint(
              new kakao.maps.Point(box.width / 2, box.height / 2 + shiftOf())
            );
          const next = {
            lat: target.getLat(),
            lng: target.getLng(),
            level: fromKakaoLevel(m.getLevel()),
          };
          const cur = latest.current.viewport;
          if (
            Math.abs(next.lat - cur.lat) > 1e-6 ||
            Math.abs(next.lng - cur.lng) > 1e-6 ||
            next.level !== cur.level
          )
            latest.current.onViewportChange(next);
          redraw();
        });
        const measure = () => {
          const r = el.getBoundingClientRect();
          setBox({ width: r.width, height: r.height });
        };
        observer = new ResizeObserver(() => {
          m.relayout();
          measure();
          redraw();
        });
        observer.observe(el);
        measure();
        setMap(m);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  // 조작 가능 여부
  useEffect(() => {
    if (!map) return;
    map.setDraggable(interactive);
    map.setZoomable(interactive);
  }, [map, interactive]);

  // viewport → 지도 (이미 그 위치면 그대로)
  useEffect(() => {
    if (!map) return;
    const kakao = window.kakao;
    const el = rootRef.current;
    const box = el.getBoundingClientRect();
    const level = toKakaoLevel(viewport.level);
    const proj = map.getProjection();
    const nowTarget = proj.coordsFromContainerPoint(
      new kakao.maps.Point(box.width / 2, box.height / 2 + shiftOf())
    );
    if (
      map.getLevel() === level &&
      Math.abs(nowTarget.getLat() - viewport.lat) < 1e-5 &&
      Math.abs(nowTarget.getLng() - viewport.lng) < 1e-5
    )
      return;
    if (map.getLevel() !== level) map.setLevel(level);
    const p = map
      .getProjection()
      .containerPointFromCoords(new kakao.maps.LatLng(viewport.lat, viewport.lng));
    map.panTo(
      map.getProjection().coordsFromContainerPoint(new kakao.maps.Point(p.x, p.y - shiftOf()))
    );
  }, [map, viewport.lat, viewport.lng, viewport.level, topInset, bottomInset]);

  if (error)
    return (
      <div className="absolute inset-0 z-0 grid place-items-center bg-[#eceef4] px-8 text-center">
        <p className="text-[13px] font-semibold leading-relaxed text-black/50">
          {error}
          <br />
          목록에서는 장소를 계속 볼 수 있어요.
        </p>
      </div>
    );

  // ---------------- 지도 위 층: 마커·클러스터·말풍선 ----------------
  const kakao = window.kakao;
  const toPoint = (ll) => {
    const p = map.getProjection().containerPointFromCoords(new kakao.maps.LatLng(ll.lat, ll.lng));
    return { x: p.x, y: p.y };
  };

  let pins = [];
  let clusters = [];
  let selected = null;
  if (map) {
    const items = [];
    for (const marker of markers) {
      const { x, y } = toPoint(marker);
      if (x < -30 || y < -30 || x > box.width + 30 || y > box.height + 60) continue;
      const item = { marker, x, y };
      if (marker.id === selectedId) selected = item;
      else items.push(item);
    }
    const used = items.map(() => false);
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      const group = [items[i]];
      used[i] = true;
      for (let j = i + 1; j < items.length; j++) {
        if (used[j]) continue;
        if (Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y) < CLUSTER_RADIUS) {
          group.push(items[j]);
          used[j] = true;
        }
      }
      if (group.length === 1) pins.push(group[0]);
      else clusters.push(group);
    }
  }

  function onClusterClick(event, group) {
    event.stopPropagation();
    const lat = group.reduce((s, it) => s + it.marker.lat, 0) / group.length;
    const lng = group.reduce((s, it) => s + it.marker.lng, 0) / group.length;
    const ids = group.map((it) => it.marker.id);
    setPopup((cur) => (cur && cur.ids.join() === ids.join() ? null : { ids, lat, lng }));
  }

  function renderPin(item, isSelected) {
    const { marker } = item;
    return (
      <button
        key={marker.id}
        type="button"
        tabIndex={interactive ? 0 : -1}
        disabled={!interactive}
        onClick={(event) => {
          event.stopPropagation();
          onSelectMarker(marker.id);
        }}
        aria-label={marker.label + (marker.saved ? ' (찜함)' : '')}
        aria-pressed={isSelected}
        className="pointer-events-auto absolute left-0 top-0 size-0 p-0"
        style={{
          transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
          zIndex: isSelected ? 10000 : 10 + Math.round(item.y),
        }}
      >
        <CategoryPin
          kind={marker.kind}
          color={marker.color}
          className={`absolute -left-[16px] -top-[40px] h-10 w-8 origin-bottom overflow-visible transition-transform duration-200 ${isSelected ? 'scale-[1.3]' : ''}`}
          style={{
            filter: isSelected
              ? 'drop-shadow(0 3px 5px rgba(23,25,35,0.4))'
              : 'drop-shadow(0 2px 3px rgba(23,25,35,0.3))',
          }}
        />
        {marker.saved && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`absolute size-[15px] ${isSelected ? 'left-[4px] -top-[56px]' : 'left-[6px] -top-[46px]'}`}
          >
            <path
              d="M12 20.8s-8.2-5-9.9-10.2C1 7 3.3 3.8 6.8 3.8c2.1 0 3.9 1.2 5.2 3.2 1.3-2 3.1-3.2 5.2-3.2 3.5 0 5.8 3.2 4.7 6.8C20.2 15.8 12 20.8 12 20.8z"
              fill="#e5445f"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    );
  }

  let popupInfo = null;
  if (map && popup) {
    const group = markers.filter((m) => popup.ids.includes(m.id));
    if (group.length) {
      const p = toPoint(popup);
      const diameter = 34 + Math.min(popup.ids.length, 9) * 2;
      const width = 220;
      const left = clamp(p.x - width / 2, 8, Math.max(8, box.width - width - 8));
      // 기본은 클러스터 아래. 아래 공간이 모자라면 위로 연다 (지도 영역이 시트 위까지라 아래가 잘릴 수 있음)
      // 둘 다 모자라면 더 넓은 쪽에 열고 목록 높이를 그 공간에 맞춘다
      const want = Math.min(180, group.length * 36) + 8;
      const below = p.y + diameter / 2 + 8;
      const roomBelow = box.height - below - 8;
      const roomAbove = p.y - diameter / 2 - 16 - topInset; // 상단 칩 줄에 가리지 않게
      const flip = roomBelow < want && roomAbove > roomBelow;
      const height = Math.max(60, Math.min(want, flip ? roomAbove : roomBelow));
      const top = flip ? p.y - diameter / 2 - 8 - height : below;
      popupInfo = { group, left, top, flip, width, listMax: height - 8, arrowX: p.x - left };
    }
  }

  const me = map && myLocation ? toPoint(myLocation) : null;

  return (
    <div
      className="absolute inset-x-0 top-0 isolate z-0 overflow-hidden bg-[#eceef4]"
      style={{ bottom: bottomInset }}
    >
      <div
        ref={rootRef}
        role="application"
        aria-label="부산 지도"
        className="absolute inset-0 z-0"
      />
      <div className="pointer-events-none absolute inset-0 z-[500] overflow-hidden">
        {me && (
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate3d(${me.x}px, ${me.y}px, 0)`, zIndex: 5 }}
            aria-label="내 위치"
          >
            <span className="absolute -left-5 -top-5 size-10 animate-ping rounded-full bg-[#2f7df6]/20 motion-reduce:animate-none" />
            <span className="absolute -left-2 -top-2 size-4 rounded-full border-[3px] border-white bg-[#2f7df6] shadow-[0_2px_8px_rgba(47,125,246,0.5)]" />
          </div>
        )}

        {pins.map((item) => renderPin(item, false))}

        {clusters.map((group) => {
          const x = group.reduce((s, it) => s + it.x, 0) / group.length;
          const y = group.reduce((s, it) => s + it.y, 0) / group.length;
          const diameter = 34 + Math.min(group.length, 9) * 2;
          return (
            <button
              key={`cluster-${group[0].marker.id}`}
              type="button"
              tabIndex={interactive ? 0 : -1}
              disabled={!interactive}
              onClick={(event) => onClusterClick(event, group)}
              aria-label={`장소 ${group.length}곳 묶음, 누르면 목록`}
              className="pointer-events-auto absolute left-0 top-0 size-0 p-0"
              style={{ transform: `translate3d(${x}px, ${y}px, 0)`, zIndex: 5000 }}
            >
              <span
                className="absolute grid place-items-center rounded-full border-[3px] border-white bg-[#2F7BF5] text-[13px] font-extrabold text-white shadow-[0_2px_8px_rgba(23,25,35,0.28)]"
                style={{
                  width: diameter,
                  height: diameter,
                  left: -diameter / 2,
                  top: -diameter / 2,
                }}
              >
                {group.length}
              </span>
            </button>
          );
        })}

        {selected && renderPin(selected, true)}

        {popupInfo && (
          <div
            role="listbox"
            aria-label="묶인 장소 목록"
            className="pointer-events-auto absolute left-0 top-0 rounded-xl bg-white p-1 shadow-[0_6px_20px_rgba(23,25,35,0.25)]"
            style={{
              transform: `translate3d(${popupInfo.left}px, ${popupInfo.top}px, 0)`,
              width: popupInfo.width,
              zIndex: 20000,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <span
              className={`absolute size-3 rotate-45 bg-white ${popupInfo.flip ? '-bottom-1.5' : '-top-1.5'}`}
              style={{ left: clamp(popupInfo.arrowX, 14, popupInfo.width - 14) - 6 }}
            />
            <ul className="relative overflow-y-auto" style={{ maxHeight: popupInfo.listMax }}>
              {popupInfo.group.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setPopup(null);
                      onSelectMarker(m.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left active:bg-black/5"
                  >
                    <CategoryBadge kind={m.kind} color={m.color} className="size-6 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">
                      {m.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
