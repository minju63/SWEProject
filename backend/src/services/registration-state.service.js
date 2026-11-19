import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/response.js';
import { createFileRegistrationState } from './registration-file-state.service.js';
const messages = {
  IDENTITY_EXISTS: '이미 사용 중이거나 가입 진행 중인 아이디·이메일이에요.',
  INVALID_CHALLENGE: '가입 요청을 다시 확인해주세요.',
  EXPIRED_REQUEST: '가입 요청이 만료됐어요. 정리 후 다시 가입해주세요.',
  COOLDOWN: '인증번호는 마지막 요청 60초 후 다시 발송할 수 있어요.',
  EXPIRED: '인증번호가 만료됐어요. 다시 발송해주세요.',
  ATTEMPTS: '인증번호를 5회 틀렸어요. 다시 발송해주세요.',
  BUSY: '같은 요청을 처리하고 있어요. 잠시 후 다시 시도해주세요.',
  NOT_VERIFIED: '이메일 인증을 완료해주세요.',
  USER_MISMATCH: '해당 계정의 인증 요청이 아니에요.',
  STALE_OPERATION: '오래된 처리 결과예요. 현재 가입 상태를 다시 확인해주세요.',
  ALREADY_COMPLETED: '이미 가입을 완료했어요.',
  INVALID_STATE: '현재 단계에서는 이 요청을 처리할 수 없어요.',
};
export function createRegistrationState(client = supabase) {
  return {
    async command(action, id = null, input = {}) {
      const { data, error } = await client.rpc('registration_command', {
        p_action: action,
        p_id: id,
        p_input: input,
      });
      if (error)
        throw new AppError(
          503,
          'REGISTRATION_DATABASE',
          '가입 상태 DB를 확인하지 못했어요. 관리자에게 문의해주세요.'
        );
      if (data?.error)
        throw new AppError(
          ['COOLDOWN', 'ATTEMPTS'].includes(data.error)
            ? 429
            : ['BUSY', 'IDENTITY_EXISTS', 'STALE_OPERATION'].includes(data.error)
              ? 409
              : 400,
          data.error,
          messages[data.error] || '가입 요청을 다시 확인해주세요.'
        );
      return data;
    },
  };
}
// Database hardening is explicitly opt-in; the user postponed SQL installation.
export const registrationState =
  process.env.REGISTRATION_STATE_DRIVER === 'database'
    ? createRegistrationState()
    : createFileRegistrationState();
