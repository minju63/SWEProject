// 카카오맵 JavaScript SDK 를 한 번만 불러온다. 키는 frontend/.env 의 VITE_KAKAO_JS_KEY.
// 카카오 개발자 콘솔에 사이트 도메인을 등록해야 동작한다 (NFR-MAP-014).
let loading = null;

export function loadKakaoMaps() {
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  if (loading) return loading;
  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) return Promise.reject(new Error('카카오맵 키(VITE_KAKAO_JS_KEY)가 설정되지 않았어요.'));

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        loading = null;
        reject(new Error('카카오맵을 불러오지 못했어요. 키와 등록 도메인을 확인하세요.'));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('카카오맵을 불러오지 못했어요.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
