import { api } from './client';

// AI 응답 또는 대체 결과는 10초 안에 보여야 한다 (NFR-001). 넘기면 안내 문구로 대체
// 질문은 서버에서 개인정보를 가린 뒤 처리한다. 현재 위치는 보내지 않는다.
export const fetchRecommend = (categoryId) =>
  api.get('/assistant/recommend', { params: { categoryId }, timeout: 10000 });
export const sendChat = (message, context) =>
  api.post('/assistant/chat', { message, context }, { timeout: 10000 });
