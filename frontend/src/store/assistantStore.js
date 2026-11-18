import { create } from 'zustand';

// Dr.부 상태. 위치(좌·우, 높이)와 숨김 여부는 기기에 저장하고(FR-A07), 대화창 열림은 저장하지 않는다.
const KEY = 'chunghae.assistant';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {
    // 저장소를 못 읽어도 기본값으로 동작
  }
  return {};
}

function save(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ hidden: state.hidden, side: state.side, bottom: state.bottom })
    );
  } catch {
    // 저장 실패는 무시
  }
}

const saved = load();

export const useAssistantStore = create((set, get) => ({
  hidden: saved.hidden ?? false,
  side: saved.side === 'left' ? 'left' : 'right',
  bottom: typeof saved.bottom === 'number' ? saved.bottom : 16, // 하단 탭 위 여백(px)

  // 대화창: open 일 때 request 로 첫 동작을 정한다 { mode: 'recommend', categoryId } | { mode: 'free' }
  chatOpen: false,
  request: null,

  hide: () => {
    set({ hidden: true, chatOpen: false });
    save(get());
  },
  show: () => {
    set({ hidden: false });
    save(get());
  },
  move: (side, bottom) => {
    set({ side, bottom });
    save(get());
  },
  openChat: (request = { mode: 'free' }) =>
    set({ chatOpen: true, request: { ...request, at: Date.now() } }),
  closeChat: () => set({ chatOpen: false }),
}));

// 최근 대화 (FR-A19): 마지막 20개 메시지만 기기에 저장해 다시 열어도 이어서 할 수 있다
const HISTORY_KEY = 'chunghae.assistantHistory';
const HISTORY_MAX = 20;

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveHistory(messages) {
  try {
    if (messages.length === 0) localStorage.removeItem(HISTORY_KEY);
    else localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)));
  } catch {
    // 저장 실패는 무시
  }
}
