import * as placeService from '../services/place.service.js';
import { ok, AppError } from '../utils/response.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 지도 장소 목록. 사용자 위치는 받지 않는다(거리 계산·필터는 브라우저에서: SDD ADR-007)
export async function list(req, res) {
  ok(res, await placeService.listPlaces());
}

export async function detail(req, res) {
  if (!UUID.test(req.params.placeId))
    throw new AppError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
  ok(res, await placeService.getPlace(req.params.placeId));
}
