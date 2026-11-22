// 터치 영역 44×44px 보장 (NFR-COM-011, NFR-MAP-016)
// 찜·알림·닫기·지도 버튼처럼 화면에서는 작게 보이는 아이콘 버튼의 눈에 보이는 크기는 그대로 두고,
// 누를 수 있는 영역만 투명하게 44×44px 이상으로 넓힌다. 화면이 바뀔 때마다 새로 나온 버튼에도 적용한다.
const SELECTOR = [
  'button[aria-label*="찜"]',
  'button[aria-label^="알림"]',
  'button[aria-label*="Dr.부"]',
  'button[aria-label*="닫기"]',
  'button[aria-label*="확대"]',
  'button[aria-label*="축소"]',
  'button[aria-label*="내 위치"]',
  'button[aria-label="필터"]',
  'button[aria-label*="설정"]',
  'button[aria-label="뒤로 가기"]',
  'button[aria-label*="이전 달"]',
  'button[aria-label*="다음 달"]',
].join(',');
const MIN = 44;

function widen(root = document) {
  for (const el of root.querySelectorAll(SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const tx = Math.max(0, (MIN - r.width) / 2);
    const ty = Math.max(0, (MIN - r.height) / 2);
    if (tx === 0 && ty === 0) {
      el.classList.remove('touch44');
      continue;
    }
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.classList.add('touch44');
  }
}

export function watchTouchTargets() {
  if (typeof document === 'undefined') return;
  let queued = false;
  const run = () => {
    queued = false;
    widen();
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  schedule();
}
