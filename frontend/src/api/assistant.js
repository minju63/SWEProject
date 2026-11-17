import { api } from './client';

// 질문은 서버에서 개인정보를 가린 뒤 처리한다. 현재 위치는 보내지 않는다.
export const fetchRecommend = (categoryId) =>
  api.get('/assistant/recommend', { params: { categoryId }, timeout: 20000 });
export const sendChat = (message, context) =>
  api.post('/assistant/chat', { message, context }, { timeout: 20000 });
