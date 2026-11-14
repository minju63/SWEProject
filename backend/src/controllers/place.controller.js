import * as placeService from '../services/place.service.js';
import { ok, AppError } from '../utils/response.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 지도 장소 목록. 사용자 위치는 받지 않는다(거리 계산·필터는 브라우저에서: SDD ADR-007)
export async function list(req, res) {
  ok(res, await placeService.listPlaces());
}

const checkId = (placeId) => {
  if (!UUID.test(placeId)) throw new AppError(404, 'PLACE_NOT_FOUND', '장소를 찾을 수 없습니다.');
};

export async function detail(req, res) {
  checkId(req.params.placeId);
  ok(res, await placeService.getPlace(req.params.placeId));
}

// 찜한 장소 번호 목록 (FR-MAP-019·020)
export async function saved(req, res) {
  ok(res, { placeIds: await placeService.listSavedPlaces(req.user.id) });
}

export async function save(req, res) {
  checkId(req.params.placeId);
  await placeService.savePlace(req.user.id, req.params.placeId);
  ok(res, null);
}

export async function unsave(req, res) {
  checkId(req.params.placeId);
  await placeService.unsavePlace(req.user.id, req.params.placeId);
  ok(res, null);
}
