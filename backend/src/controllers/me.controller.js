import * as userRepo from '../repositories/user.repository.js';
import { createDefaultAlarms } from '../services/calendar.service.js';
import { ok, AppError } from '../utils/response.js';
import { validateProfilePatch } from '../services/profile-validation.service.js';

export async function getProfile(req, res) {
  ok(res, await userRepo.findProfile(req.user.id));
}

export async function updateProfile(req, res) {
  const profile = validateProfilePatch(req.body);
  ok(res, await userRepo.upsertProfile(req.user.id, profile));
}

export async function listBookmarks(req, res) {
  ok(res, await userRepo.findBookmarks(req.user.id));
}

export async function addBookmark(req, res) {
  const { policyId, savedFrom } = req.body ?? {};
  if (!policyId) throw new AppError(400, 'POLICY_ID_REQUIRED', 'policyId가 필요합니다.');
  const bookmark = await userRepo.insertBookmark(req.user.id, policyId, savedFrom);
  // 찜하면 기본 알림(1일 전·30분 전)도 넣는다. 알림이 실패해도 찜은 유지한다 (FR-H12, FR-A15)
  try {
    await createDefaultAlarms(req.user.id, policyId);
  } catch (e) {
    console.warn('[알림] 기본 알림 등록 실패:', e.message);
  }
  ok(res, bookmark, 201);
}

export async function removeBookmark(req, res) {
  await userRepo.deleteBookmark(req.user.id, req.params.policyId);
  ok(res, null);
}
