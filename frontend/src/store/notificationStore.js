import { create } from 'zustand';

// 알림 목록과 읽음 상태를 한곳에서 관리한다. 알림 화면과 모든 화면의 종(파란 점)이 같은 값을 본다.
// TODO: 지금은 화면용 예시 알림이다. 실제 알림(notification 테이블) API 로 바꿀 때 이 store 만 바꾸면 된다.
const initial = [
  { id: 1, type: '마감', title: '찜한 혜택이 곧 마감돼요', description: '부산 청년 교통비 지원(예시 정책)이 5일 후 마감돼요.', time: '10분 전', unread: true, action: '혜택 확인' },
  { id: 2, type: '신청', title: '신청 상태를 확인해주세요', description: '청년도약계좌의 신청 상태를 공식 사이트에서 확인한 뒤 직접 변경해주세요.', time: '1시간 전', unread: true, action: '신청 관리' },
  { id: 3, type: '혜택', title: '은혜님을 위한 새로운 혜택', description: '사하구 청년 생활안정 지원사업(예시 정책)을 확인해보세요.', time: '오늘 오전 9:20', unread: true, action: '추천 보기' },
  { id: 4, type: '혜택', title: '부산진구 맞춤 정책이 추가됐어요', description: '부산진구 청년 취업역량 강화사업(예시 정책)이 등록됐어요.', time: '어제', unread: false, action: '정책 확인' },
  { id: 5, type: '신청', title: '결과 발표 예정일이에요', description: '사하구 청년 생활안정 지원사업의 결과를 공식 사이트에서 확인해주세요.', time: '5월 28일', unread: false, action: '결과 확인' },
];

export const useNotificationStore = create((set) => ({
  notifications: initial,
  markRead: (id) =>
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)) })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, unread: false })) })),
}));

export const selectUnreadCount = (s) => s.notifications.filter((n) => n.unread).length;
