import { create } from 'zustand';

// 모든 화면에서 찜을 해제할 때 같은 안내를 쓴다 (알림은 찜에 묶여 있어 함께 취소된다)
export const UNBOOKMARK_TOAST = '찜을 해제했어요. 알림도 함께 취소했어요';

// 화면 아래 잠깐 뜨는 안내. action 이 있으면 오른쪽에 버튼(예: 되돌리기)을 보여준다.
let timer;
export const useToastStore = create((set) => ({
  toast: null,
  show: (text, { action, duration = 3000 } = {}) => {
    clearTimeout(timer);
    set({ toast: { text, action } });
    timer = setTimeout(() => set({ toast: null }), duration);
  },
  hide: () => {
    clearTimeout(timer);
    set({ toast: null });
  },
}));
