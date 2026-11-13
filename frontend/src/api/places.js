import { api } from './client';

// 지도 장소 (사용자 위치는 보내지 않는다. 거리·필터는 브라우저에서 계산)
export const fetchPlaces = () => api.get('/places');
export const fetchPlace = (placeId) => api.get(`/places/${placeId}`);
