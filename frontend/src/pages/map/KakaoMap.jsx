import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { loadKakaoMaps } from './kakaoLoader.js';
import { CategoryBadge, CategoryPin } from './mapIcons.jsx';

/*
 * 카카오맵 JavaScript SDK 지도.
 * - 카카오는 지도 그림·좌표 변환만 맡고, 마커·클러스터·말풍선은 이 컴포넌트가 지도 위 층에 그린다.
 *   (클러스터는 카카오 결과가 아니라 우리 DB 좌표로 만든다: FR-MAP-003)
 * - 지도 영역은 하단 시트 위까지만 둔다 → 카카오 로고·저작권 표기가 가려지지 않는다 (NFR-MAP-022).
 * - viewport = { lat, lng, zoom }: 상단 칩 줄 아래 보이는 영역의 가운데와 확대 단계(클수록 가깝게).
 *
 * 움직임 맞추기
 *   카카오는 확대·축소 애니메이션과 부드러운 이동(panTo) 중에는 이벤트 없이 화면만 바꾸고 끝난 뒤에 한 번 알린다.
 *   그래서 마커 층은 카카오 지도 DOM 의 변화를 직접 읽어 같은 프레임에 따라간다.
 *   - 이동: 지도 판(pane)의 left/top 이 바뀐 만큼 옮긴다.
 *   - 확대·축소: 애니메이션 중인 타일 이미지 하나의 크기·위치로 배율과 이동량을 구한다.
 *   마커 층에는 CSS 변수(--s 배율, --tx·--ty 이동량)만 바꾸고, 마커 위치는 확대 단계가 바뀔 때 다시 계산한다.
 *   카카오 DOM 구조가 바뀌어 읽지 못하면 확대·축소 동안 마커를 잠깐 숨기고 끝난 뒤 다시 그린다.
 * - 확대 단계가 바뀌면 클러스터가 갈라지거나 합쳐지는 모습을 짧게 움직여 보여준다.
 */
export const MIN_ZOOM = -1; // 가장 넓게: 작은 화면에서도 두 구가 다 보이게
export const MAX_ZOOM = 6;
const KAKAO_LEVEL_BASE = 8; // 카카오 레벨 = 8 - zoom (카카오는 숫자가 클수록 넓다)
const CLUSTER_PX = 46; // 화면 거리 46px 미만이면 묶는다 (FR-MAP-003)
const ZOOM_MS = 300;
const SPLIT_MS = 280;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toKakaoLevel = (zoom) => KAKAO_LEVEL_BASE - clamp(zoom, MIN_ZOOM, MAX_ZOOM);
const toZoom = (level) => clamp(KAKAO_LEVEL_BASE - level, MIN_ZOOM, MAX_ZOOM);
const latLng = (p) => new window.kakao.maps.LatLng(p.lat, p.lng);
const average = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / list.length;
const clusterSize = (count) => 34 + Math.min(count, 9) * 2;

// 마커 층 변수를 반영한 위치. 지도가 움직이는 동안에는 변수만 바뀐다
const placeAt = (x, y) =>
  `translate3d(calc(${x}px * var(--s, 1) + var(--tx, 0px)), calc(${y}px * var(--s, 1) + var(--ty, 0px)), 0)`;

// ---------------- 지도 좌표 계산 ----------------
const toPoint = (map, p) => map.getProjection().containerPointFromCoords(latLng(p));

// 보이는 영역(상단 칩 줄 아래)의 가운데
const visibleCenter = (el, topInset) => ({
  x: el.clientWidth / 2,
  y: el.clientHeight / 2 + topInset / 2,
});

// target 이 보이는 영역 가운데에 오게 하는 지도 중심
function centerFor(map, target, topInset) {
  const p = toPoint(map, target);
  return map
    .getProjection()
    .coordsFromContainerPoint(new window.kakao.maps.Point(p.x, p.y - topInset / 2));
}

const EMPTY_SCENE = { points: [], clusters: [] };

// 같은 확대 단계에서는 지도를 옮겨도 늘 같은 묶음이 나오게 id 순서로 묶는다. 고른 장소는 묶지 않는다
function buildScene(map, markers, selectedId) {
  const points = markers
    .map((marker) => {
      const p = toPoint(map, marker);
      return { marker, x: p.x, y: p.y, cluster: null };
    })
    .sort((a, b) => (a.marker.id < b.marker.id ? -1 : 1));
  const clusters = [];
  for (let i = 0; i < points.length; i++) {
    const seed = points[i];
    if (seed.cluster || seed.marker.id === selectedId) continue;
    const group = [seed];
    for (let j = i + 1; j < points.length; j++) {
      const other = points[j];
      if (other.cluster || other.marker.id === selectedId) continue;
      if (Math.hypot(seed.x - other.x, seed.y - other.y) < CLUSTER_PX) group.push(other);
    }
    if (group.length === 1) continue;
    const members = group.map((g) => g.marker);
    const cluster = {
      key: `c-${seed.marker.id}`,
      members,
      x: average(group, 'x'),
      y: average(group, 'y'),
      lat: average(members, 'lat'),
      lng: average(members, 'lng'),
    };
    for (const g of group) g.cluster = cluster;
    clusters.push(cluster);
  }
  return { points, clusters };
}

// ---------------- 카카오 지도 DOM 따라가기 ----------------
// 카카오 컨테이너 > div > 지도 판(끌기·panTo 때 left/top 이 바뀜) > 타일 층들
function findPane(root) {
  const pane = root.firstElementChild?.firstElementChild;
  return pane?.style.position === 'absolute' ? pane : null;
}

const paneOffset = (pane) => ({
  x: parseFloat(pane.style.left) || 0,
  y: parseFloat(pane.style.top) || 0,
});

// 확대·축소 시작: 기준 타일(가장 큰 것)의 지금 위치를 기억한다
function beginZoomFollow(st, root) {
  const box = root.getBoundingClientRect();
  let img = null;
  let rect = null;
  for (const el of st.pane?.querySelectorAll('img') ?? []) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (!rect || r.width > rect.width)) [img, rect] = [el, r];
  }
  if (!img) {
    st.zoom = { img: null };
    return;
  }
  const off = paneOffset(st.pane);
  st.zoom = {
    img,
    width: rect.width,
    x: rect.left - box.left,
    y: rect.top - box.top,
    rootX: box.left,
    rootY: box.top,
    paneX: off.x,
    paneY: off.y,
  };
}

// 마지막으로 그린 뒤 지도가 움직인 만큼 마커 층 변수를 바꾼다
function syncLayer(st, layer) {
  if (!layer) return;
  let s = 1;
  let tx = 0;
  let ty = 0;
  let hidden = false;
  if (st.pane) {
    const off = paneOffset(st.pane);
    tx = off.x - st.base.x;
    ty = off.y - st.base.y;
  }
  const z = st.zoom;
  if (z) {
    const r = z.img?.isConnected ? z.img.getBoundingClientRect() : null;
    if (!r?.width) {
      hidden = true;
    } else {
      // 그린 좌표 p → 확대 시작 화면 p + d0 → 지금 화면 R + (p + d0 - R0) * s
      s = r.width / z.width;
      tx = r.left - z.rootX + (z.paneX - st.base.x - z.x) * s;
      ty = r.top - z.rootY + (z.paneY - st.base.y - z.y) * s;
    }
  }
  layer.style.setProperty('--s', String(s));
  layer.style.setProperty('--tx', `${tx}px`);
  layer.style.setProperty('--ty', `${ty}px`);
  layer.style.opacity = hidden ? '0' : '';
}

/*
 * viewport 로 가는 이동을 한 단계씩 진행한다: 먼저 옮기고(panTo), 도착하면 그 자리를 기준으로 확대·축소.
 * 지도 크기가 바뀌면(하단 카드 열림) 카카오가 진행 중인 이동을 끊고 idle 을 보내므로,
 * idle 마다 실제로 도착했는지 확인하고 이어서 진행한다.
 */
function advanceGoal(map, st, el, topInset) {
  const goal = st.goal;
  if (!goal) return;
  const target = { lat: goal.lat, lng: goal.lng };
  const p = toPoint(map, target);
  const c = visibleCenter(el, topInset);
  if (Math.hypot(p.x - c.x, p.y - c.y) >= 1 && goal.pans < 3) {
    goal.pans += 1;
    map.panTo(centerFor(map, target, topInset));
  } else if (map.getLevel() !== goal.level) {
    st.selfZoom = true;
    map.setLevel(goal.level, { animate: { duration: ZOOM_MS }, anchor: latLng(target) });
  } else {
    st.goal = null;
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function KakaoMap({
  viewport,
  onViewportChange,
  markers,
  selectedId,
  onSelectMarker,
  myLocation,
  bottomInset = 0,
  topInset = 0,
}) {
  const rootRef = useRef(null);
  const layerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const [, setFrame] = useState(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [popup, setPopup] = useState(null);
  // 지도 움직임 상태 (렌더링과 무관한 값)
  const follow = useRef({
    pane: null,
    base: { x: 0, y: 0 }, // 마지막으로 그릴 때 지도 판 위치
    zoom: null, // 확대·축소 애니메이션 중 기준 타일
    selfZoom: false, // 이 컴포넌트가 시작한 확대·축소
    userMoving: false, // 사용자가 끌기·휠·두 번 누르기로 움직임 → 끝나면 viewport 를 알린다
    goal: null, // viewport 로 가는 중인 이동 { lat, lng, level, pans }
    shown: new Map(), // 마커 id → 직전에 보이던 자리 { lat, lng, visible } (클러스터 애니메이션용)
    clusterKeys: new Set(),
  });
  const latest = useRef({ viewport, onViewportChange, onSelectMarker, topInset });
  useLayoutEffect(() => {
    latest.current = { viewport, onViewportChange, onSelectMarker, topInset };
  });

  // 지도 만들기
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    loadKakaoMaps()
      .then((kakao) => {
        const el = rootRef.current;
        if (cancelled || !el) return;
        const st = follow.current;
        const { viewport: vp, topInset: top } = latest.current;
        const m = new kakao.maps.Map(el, { center: latLng(vp), level: toKakaoLevel(vp.zoom) });
        m.setMinLevel(toKakaoLevel(MAX_ZOOM));
        m.setMaxLevel(toKakaoLevel(MIN_ZOOM));
        m.setCenter(centerFor(m, vp, top));
        st.pane = findPane(el);

        const redraw = () => queueMicrotask(() => flushSync(() => setFrame((n) => n + 1)));
        const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
        const report = () => {
          const c = visibleCenter(el, latest.current.topInset);
          const at = m.getProjection().coordsFromContainerPoint(new kakao.maps.Point(c.x, c.y));
          latest.current.onViewportChange({
            lat: at.getLat(),
            lng: at.getLng(),
            zoom: toZoom(m.getLevel()),
          });
        };

        const handlers = {
          dragstart: () => {
            st.userMoving = true;
            st.goal = null;
          },
          zoom_start: () => {
            if (st.selfZoom) st.selfZoom = false;
            else {
              st.userMoving = true;
              st.goal = null;
            }
            setPopup(null);
            beginZoomFollow(st, el);
            syncLayer(st, layerRef.current);
          },
          zoom_changed: () => {
            st.selfZoom = false;
            st.zoom = null;
            redraw();
          },
          idle: () => {
            advanceGoal(m, st, el, latest.current.topInset);
            if (st.userMoving) {
              st.userMoving = false;
              report();
            }
          },
          click: () => {
            setPopup(null);
            latest.current.onSelectMarker(null);
          },
        };
        // 지도 판을 찾지 못하면 이동이 끝날 때마다 다시 그린다
        if (!st.pane) handlers.center_changed = redraw;
        for (const [type, fn] of Object.entries(handlers))
          kakao.maps.event.addListener(m, type, fn);

        const mutations = new MutationObserver(() => syncLayer(st, layerRef.current));
        if (st.pane)
          mutations.observe(st.pane, {
            attributes: true,
            attributeFilter: ['style'],
            subtree: true,
          });
        const resize = new ResizeObserver(() => {
          m.relayout();
          measure();
          advanceGoal(m, st, el, latest.current.topInset); // 크기가 바뀌며 끊긴 이동을 이어 간다
          redraw();
        });
        resize.observe(el);
        measure();
        setMap(m);

        cleanup = () => {
          for (const [type, fn] of Object.entries(handlers))
            kakao.maps.event.removeListener(m, type, fn);
          mutations.disconnect();
          resize.disconnect();
        };
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  // viewport → 지도. 이미 그 자리면 그대로 둔다. 자리와 단계가 다 바뀌면 먼저 옮기고 이어서 확대한다
  const { lat, lng, zoom } = viewport;
  useEffect(() => {
    if (!map) return;
    const st = follow.current;
    st.userMoving = false;
    st.goal = { lat, lng, level: toKakaoLevel(zoom), pans: 0 };
    advanceGoal(map, st, rootRef.current, latest.current.topInset);
  }, [map, lat, lng, zoom]);

  const scene = map ? buildScene(map, markers, selectedId) : EMPTY_SCENE;

  // 그린 직후: 마커 층 기준을 지금 지도 판 위치로 맞추고, 묶음이 바뀐 마커를 움직여 보여준다
  useLayoutEffect(() => {
    const st = follow.current;
    const layer = layerRef.current;
    if (st.pane) st.base = paneOffset(st.pane);
    syncLayer(st, layer);
    if (!map || !layer) return;

    const prev = st.shown;
    const prevKeys = st.clusterKeys;
    st.shown = new Map(
      scene.points.map(({ marker, cluster }) => [
        marker.id,
        { lat: (cluster ?? marker).lat, lng: (cluster ?? marker).lng, visible: !cluster },
      ])
    );
    st.clusterKeys = new Set(scene.clusters.map((c) => c.key));
    if (!prev.size || reducedMotion()) return;

    const slide = (el, from, to, opacity) =>
      el.animate(
        [
          { translate: `${from.x - to.x}px ${from.y - to.y}px`, opacity: opacity[0] },
          { translate: '0px 0px', opacity: opacity[1] },
        ],
        { duration: SPLIT_MS, easing: EASE }
      );

    const pins = new Map(
      [...layer.querySelectorAll('[data-pin]')].map((el) => [el.dataset.pin, el])
    );
    for (const { marker, x, y, cluster } of scene.points) {
      const el = pins.get(marker.id);
      const before = prev.get(marker.id);
      if (!el) continue;
      if (!before) {
        if (!cluster) slide(el, { x, y }, { x, y }, [0, 1]); // 새로 나타난 장소
        continue;
      }
      if (!before.visible && cluster) continue;
      const from = toPoint(map, before);
      const to = cluster ?? { x, y };
      if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5 && before.visible === !cluster) continue;
      // 갈라짐: 옛 클러스터 자리에서 제자리로 / 합쳐짐: 제자리에서 새 클러스터 자리로 가며 사라짐
      slide(el, from, to, [before.visible ? 1 : 0, cluster ? 0 : 1]);
    }

    const groups = new Map(
      [...layer.querySelectorAll('[data-cluster]')].map((el) => [el.dataset.cluster, el])
    );
    for (const cluster of scene.clusters) {
      const el = groups.get(cluster.key);
      const befores = cluster.members.map((m) => prev.get(m.id)).filter(Boolean);
      if (!el || !befores.length) continue;
      const points = befores.map((b) => toPoint(map, b));
      const from = { x: average(points, 'x'), y: average(points, 'y') };
      const isNew = !prevKeys.has(cluster.key);
      if (Math.hypot(from.x - cluster.x, from.y - cluster.y) < 0.5 && !isNew) continue;
      slide(el, from, cluster, [isNew && befores.every((b) => b.visible) ? 0 : 1, 1]);
    }
  });

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

  const me = map && myLocation ? toPoint(map, myLocation) : null;

  // 마커·클러스터 위에서 휠을 굴려도 확대·축소 (카카오 지도까지 이벤트가 가지 않으므로 직접 처리)
  function onWheel(event) {
    const st = follow.current;
    if (!map || st.zoom || event.target.closest('[role="listbox"]')) return;
    const r = rootRef.current.getBoundingClientRect();
    const anchor = map
      .getProjection()
      .coordsFromContainerPoint(
        new window.kakao.maps.Point(event.clientX - r.left, event.clientY - r.top)
      );
    const level = clamp(
      map.getLevel() + Math.sign(event.deltaY),
      toKakaoLevel(MAX_ZOOM),
      toKakaoLevel(MIN_ZOOM)
    );
    if (level === map.getLevel()) return;
    st.userMoving = true;
    st.goal = null;
    st.selfZoom = false;
    map.setLevel(level, { animate: { duration: ZOOM_MS }, anchor });
  }

  function onClusterClick(event, cluster) {
    event.stopPropagation();
    const ids = cluster.members.map((m) => m.id);
    setPopup((cur) =>
      cur && cur.ids.join() === ids.join() ? null : { ids, lat: cluster.lat, lng: cluster.lng }
    );
  }

  let popupInfo = null;
  if (map && popup) {
    const group = markers.filter((m) => popup.ids.includes(m.id));
    if (group.length) {
      const p = toPoint(map, popup);
      const diameter = clusterSize(popup.ids.length);
      const width = 220;
      const left = clamp(p.x - width / 2, 8, Math.max(8, box.width - width - 8));
      // 기본은 클러스터 아래. 아래 공간이 모자라면 위로 열고, 목록 높이를 남은 공간에 맞춘다
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
      <div
        ref={layerRef}
        onWheel={onWheel}
        className="pointer-events-none absolute inset-0 z-[500] overflow-hidden"
      >
        {me && (
          <div
            className="absolute left-0 top-0"
            style={{ transform: placeAt(me.x, me.y), zIndex: 5 }}
            aria-label="내 위치"
          >
            <span className="absolute -left-5 -top-5 size-10 animate-ping rounded-full bg-[#2f7df6]/20 motion-reduce:animate-none" />
            <span className="absolute -left-2 -top-2 size-4 rounded-full border-[3px] border-white bg-[#2f7df6] shadow-[0_2px_8px_rgba(47,125,246,0.5)]" />
          </div>
        )}

        {scene.points.map(({ marker, x, y, cluster }) => {
          const selected = marker.id === selectedId;
          const at = cluster ?? { x, y };
          return (
            <button
              key={marker.id}
              data-pin={marker.id}
              type="button"
              tabIndex={cluster ? -1 : 0}
              aria-hidden={cluster ? true : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onSelectMarker(marker.id);
              }}
              aria-label={marker.label + (marker.saved ? ' (찜함)' : '')}
              aria-pressed={selected}
              className="absolute left-0 top-0 size-0 p-0"
              style={{
                transform: placeAt(at.x, at.y),
                zIndex: selected ? 10000 : 10 + Math.round(y),
                opacity: cluster ? 0 : 1,
                pointerEvents: cluster ? 'none' : 'auto',
              }}
            >
              <CategoryPin
                kind={marker.kind}
                color={marker.color}
                className={`absolute -left-[16px] -top-[40px] h-10 w-8 origin-bottom overflow-visible transition-transform duration-200 ${selected ? 'scale-[1.3]' : ''}`}
                style={{
                  filter: selected
                    ? 'drop-shadow(0 3px 5px rgba(23,25,35,0.4))'
                    : 'drop-shadow(0 2px 3px rgba(23,25,35,0.3))',
                }}
              />
              {marker.saved && <SavedMark selected={selected} />}
            </button>
          );
        })}

        {scene.clusters.map((cluster) => {
          const diameter = clusterSize(cluster.members.length);
          return (
            <button
              key={cluster.key}
              data-cluster={cluster.key}
              type="button"
              onClick={(event) => onClusterClick(event, cluster)}
              aria-label={`장소 ${cluster.members.length}곳 묶음, 누르면 목록`}
              className="pointer-events-auto absolute left-0 top-0 size-0 p-0"
              style={{ transform: placeAt(cluster.x, cluster.y), zIndex: 5000 }}
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
                {cluster.members.length}
              </span>
            </button>
          );
        })}

        {popupInfo && (
          <div
            role="listbox"
            aria-label="묶인 장소 목록"
            className="pointer-events-auto absolute left-0 top-0 rounded-xl bg-white p-1 shadow-[0_6px_20px_rgba(23,25,35,0.25)]"
            style={{
              transform: placeAt(popupInfo.left, popupInfo.top),
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

// 찜한 장소 핀 위의 작은 하트
function SavedMark({ selected }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`absolute size-[15px] ${selected ? 'left-[4px] -top-[56px]' : 'left-[6px] -top-[46px]'}`}
    >
      <path
        d="M12 20.8s-8.2-5-9.9-10.2C1 7 3.3 3.8 6.8 3.8c2.1 0 3.9 1.2 5.2 3.2 1.3-2 3.1-3.2 5.2-3.2 3.5 0 5.8 3.2 4.7 6.8C20.2 15.8 12 20.8 12 20.8z"
        fill="#e5445f"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
