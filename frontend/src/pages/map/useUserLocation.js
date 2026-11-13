import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const TIMEOUT_MS = 10000; // 10초 안에 못 얻으면 실패 (FR-MAP-016)

/*
 * 브라우저 현재 위치. 좌표는 이 훅의 메모리에만 두고 서버·로그·외부 서비스에 보내지 않는다(NFR-MAP-009·010).
 * status
 *   checking  권한 상태 확인 중
 *   prompt    아직 묻지 않음 → 목적 안내 후 요청 (NFR-MAP-008)
 *   skipped   안내에서 '나중에'
 *   locating  위치 요청 중
 *   ok        위치 얻음
 *   denied    권한 거부
 *   failed    시간 초과·위치 없음·기기 미지원
 */
export function useUserLocation({ onLocated } = {}) {
  const [state, setState] = useState({ status: 'checking', position: null });
  const onLocatedRef = useRef(onLocated);
  useLayoutEffect(() => {
    onLocatedRef.current = onLocated;
  });

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'failed', position: null });
      return;
    }
    setState((s) => ({ ...s, status: 'locating' }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setState({ status: 'ok', position });
        onLocatedRef.current?.(position);
      },
      (err) => setState({ status: err.code === 1 ? 'denied' : 'failed', position: null }),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ask = () => !cancelled && setState({ status: 'prompt', position: null });
    const query = navigator.permissions?.query?.({ name: 'geolocation' });
    if (!query) {
      Promise.resolve().then(ask);
    } else {
      query
        .then((p) => {
          if (cancelled) return;
          if (p.state === 'granted') locate();
          else if (p.state === 'denied') setState({ status: 'denied', position: null });
          else ask();
        })
        .catch(ask);
    }
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const skip = useCallback(() => setState({ status: 'skipped', position: null }), []);

  return { ...state, locate, skip };
}
