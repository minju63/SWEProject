import { create } from 'zustand';

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
