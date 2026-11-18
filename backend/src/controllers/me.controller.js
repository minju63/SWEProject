import * as userRepo from '../repositories/user.repository.js';
import { ok, AppError } from '../utils/response.js';

const PROFILE_FIELDS = [
  'birth_date',
  'region_code',
  'residence_months',
  'final_education',
  'current_status',
  'interest_categories',
  'housing_type',
  'household_type',
  'lives_separately',
  'marital_status',
  'home_ownership',
  'household_role',
  'housing_benefit_status',
  'special_targets',
];

export async function getProfile(req, res) {
  ok(res, await userRepo.findProfile(req.user.id));
}

export async function updateProfile(req, res) {
  const profile = Object.fromEntries(
    PROFILE_FIELDS.filter((k) => k in req.body).map((k) => [k, req.body[k]])
  );
  ok(res, await userRepo.upsertProfile(req.user.id, profile));
}

export async function listBookmarks(req, res) {
  ok(res, await userRepo.findBookmarks(req.user.id));
}

export async function addBookmark(req, res) {
  const { policyId, savedFrom } = req.body ?? {};
  if (!policyId) throw new AppError(400, 'POLICY_ID_REQUIRED', 'policyId가 필요합니다.');
  ok(res, await userRepo.insertBookmark(req.user.id, policyId, savedFrom), 201);
}

export async function removeBookmark(req, res) {
  await userRepo.deleteBookmark(req.user.id, req.params.policyId);
  ok(res, null);
}
