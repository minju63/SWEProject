import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchHome } from '../api/home';
import { useAssistantStore } from '../store/assistantStore';
import { useToastStore } from '../store/toastStore';
import SharkAvatar from './SharkAvatar.jsx';

const SIZE = 60;
const MARGIN = 12;
const LONG_PRESS_MS = 350;
const TAB_H = 64;
const HEADER_H = 56;
const BUBBLE_KEY = 'chunghae.bubbleShown';

// 모든 탭에 떠 있는 Dr.부 (FR-A01~A07)
export default function AssistantButton() {
  const { hidden, side, bottom, hide, show, move, openChat } = useAssistantStore();
  const showToast = useToastStore((s) => s.show);
  const { pathname } = useLocation();
  const [drag, setDrag] = useState(null); // { x, y } 드래그 중 화면 좌표(왼쪽 위)
  const press = useRef(null);

  // 말풍선: 접속 후 처음 홈에 들어왔을 때 1번, 5초 (FR-A02)
  const [bubble, setBubble] = useState(null);
  const home = useQuery({
    queryKey: ['home'],
    queryFn: fetchHome,
    enabled: pathname === '/' && !hidden,
  });
  const bubbleTimer = useRef(null);
  useEffect(() => () => clearTimeout(bubbleTimer.current), []);
  useEffect(() => {
    if (pathname !== '/' || hidden || !home.data) return;
    const closing = home.data.closing_bookmarks.length;
    const text = closing
      ? `마감 임박 혜택이 ${closing}개 있어요! 물어볼래요?`
      : home.data.mine_total
        ? `나에게 맞는 혜택이 ${home.data.mine_total}개 있어요! 물어볼래요?`
        : null;
    if (!text) return; // 보여줄 상황 문구가 없으면 표시하지 않는다
    try {
      if (sessionStorage.getItem(BUBBLE_KEY)) return; // 접속 중 한 번만
      sessionStorage.setItem(BUBBLE_KEY, '1');
    } catch {
      // 저장소를 못 써도 이번 화면에서는 보여 준다
    }
    setTimeout(() => setBubble(text), 0);
    bubbleTimer.current = setTimeout(() => setBubble(null), 5000);
  }, [pathname, hidden, home.data]);

  if (hidden) return null;

  const onPointerDown = (e) => {
    if (e.target.closest('.assistant-close')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    press.current = {
      id: e.pointerId,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      dragging: false,
      timer: setTimeout(() => {
        if (!press.current) return;
        press.current.dragging = true;
        setDrag({ x: rect.left, y: rect.top });
        setBubble(null);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging) {
      // 길게 누르기 전에 손가락이 많이 움직이면 드래그 의도가 아님
      return;
    }
    e.preventDefault();
    setDrag({ x: e.clientX - p.dx, y: e.clientY - p.dy });
  };

  const onPointerUp = (e) => {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    press.current = null;
    if (!p.dragging) {
      openChat({ mode: 'free' });
      return;
    }
    // 놓으면 가까운 좌우 가장자리에 붙고, 헤더·하단 탭을 가리지 않는 높이로 맞춘다
    const x = e.clientX - p.dx;
    const y = e.clientY - p.dy;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const newSide = x + SIZE / 2 < vw / 2 ? 'left' : 'right';
    const maxBottom = vh - TAB_H - HEADER_H - SIZE;
    const newBottom = Math.min(Math.max(vh - y - SIZE - TAB_H, MARGIN), maxBottom);
    move(newSide, newBottom);
    setDrag(null);
  };

  const hideWithUndo = (e) => {
    e.stopPropagation();
    hide();
    showToast('Dr.부를 숨겼어요', { action: { label: '되돌리기', onClick: show }, duration: 5000 });
  };

  const style = drag
    ? { left: drag.x, top: drag.y, right: 'auto', bottom: 'auto' }
    : {
        [side]: `max(${MARGIN}px, calc(50% - 240px + ${MARGIN}px))`,
        bottom: `calc(var(--tabbar-h) + env(safe-area-inset-bottom) + ${bottom}px)`,
      };

  return (
    <div className={`assistant${drag ? ' assistant-dragging' : ''}`} style={style}>
      {bubble && !drag && (
        <div className={`assistant-bubble assistant-bubble-${side}`}>{bubble}</div>
      )}
      <div
        className="assistant-face"
        role="button"
        tabIndex={0}
        aria-label="Dr.부와 대화하기"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => e.key === 'Enter' && openChat({ mode: 'free' })}
      >
        <SharkAvatar size={SIZE} />
      </div>
      <button
        type="button"
        className="assistant-close"
        aria-label="Dr.부 숨기기"
        onClick={hideWithUndo}
      >
        ×
      </button>
    </div>
  );
}
