import { AppError } from '../utils/response.js';
import signupRules from '../../../shared/signup-rules.mjs';

const strings = [
  'birth_date',
  'region_code',
  'final_education',
  'housing_type',
  'household_type',
  'marital_status',
  'home_ownership',
  'household_role',
  'housing_benefit_status',
];
const arrays = ['current_status', 'interest_categories', 'special_targets'];
const empty = new Set(['', '선택 안 함', '선택하지 않음']);
const interests = new Set(['취업·진로', '주거·생활', '장학·금융', '문화', '공간·시설']);
const invalid = () => {
  throw new AppError(400, 'INVALID_PROFILE', '맞춤정보 입력값을 확인해주세요.');
};

// Validate the complete patch before writing anything. Missing fields remain unchanged.
export function validateProfilePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const out = {};
  for (const key of strings)
    if (Object.hasOwn(input, key)) {
      const value = input[key];
      if (value !== null && typeof value !== 'string') invalid();
      if (typeof value === 'string' && value.length > 100) invalid();
      const trimmed = value?.trim() ?? '';
      out[key] = empty.has(trimmed) ? null : trimmed;
    }
  if (out.birth_date) {
    const problem = signupRules.birthDateError(out.birth_date);
    if (problem) throw new AppError(400, 'INVALID_BIRTH_DATE', problem);
  }
  if (out.region_code && !/^(?:KR|\d{2}|\d{5})$/.test(out.region_code)) invalid();
  for (const key of arrays)
    if (Object.hasOwn(input, key)) {
      const value = input[key] ?? [];
      if (
        !Array.isArray(value) ||
        value.length > 50 ||
        value.some((v) => typeof v !== 'string' || v.length > 100)
      )
        invalid();
      out[key] = [...new Set(value.map((v) => v.trim()).filter((v) => !empty.has(v)))];
      if (key === 'interest_categories' && out[key].some((v) => !interests.has(v))) invalid();
    }
  if (Object.hasOwn(input, 'lives_separately')) {
    if (input.lives_separately !== null && typeof input.lives_separately !== 'boolean') invalid();
    out.lives_separately = input.lives_separately;
  }
  if (Object.hasOwn(input, 'residence_months')) {
    const value = input.residence_months;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) invalid();
    out.residence_months = value;
  }
  return out;
}
