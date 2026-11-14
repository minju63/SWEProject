import { api } from './client';

// 지도 장소 (사용자 위치는 보내지 않는다. 거리·필터는 브라우저에서 계산)
// 서버가 응답하지 않아도 10초 안에 오류 안내가 나오게 4초에서 끊는다 (NFR-MAP-005: 4초 × 2번 + 재시도 대기 1초)
const TIMEOUT_MS = 4000;
export const fetchPlaces = () => api.get('/places', { timeout: TIMEOUT_MS });
export const fetchPlace = (placeId) => api.get(`/places/${placeId}`, { timeout: TIMEOUT_MS });

// 찜한 장소 (로그인 필요)
export const fetchSavedPlaces = () => api.get('/places/saved');
export const savePlace = (placeId) => api.put(`/places/${placeId}/saved`);
export const unsavePlace = (placeId) => api.delete(`/places/${placeId}/saved`);
