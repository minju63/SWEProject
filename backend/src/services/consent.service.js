// 약관·동의 관리 (FR-MY-021, NFR-COM-024)
// 약관·동의서·외부 AI 국외 전송 안내 전문과 본인의 동의 여부·일시를 보여 주고, 선택 동의(맞춤정보)를 철회·재동의하게 한다.
// 철회하면 맞춤정보를 삭제한다. 필수 동의의 철회는 회원 탈퇴로 안내한다.
import { supabase } from '../lib/supabase.js';
import { changePersonal } from './my-workspace.service.js';
import { AppError } from '../utils/response.js';

export const CONSENT_VERSION = '2026-11-18';

export const CONSENT_DOCS = {
  terms: {
    title: '서비스 이용약관',
    required: true,
    text:
      '청해는 청년 정책 정보를 안내하는 수업 프로젝트입니다. 정책의 최종 신청 자격과 접수 여부는 공식 기관 안내를 확인해주세요. 다른 사람의 계정이나 정보를 사용하면 안 됩니다.',
  },
  privacy: {
    title: '계정 정보·서비스 이용 기록 수집·이용',
    required: true,
    text:
      '계정 식별·인증과 서비스 제공을 위해 아이디, 닉네임, 이메일, 인증·동의 기록과 서비스 이용 기록을 처리합니다. 비밀번호는 인증 서비스가 해시로 보관합니다. 필수 동의를 거부하면 가입할 수 없습니다.',
  },
  personalization: {
    title: '맞춤정보 수집·이용 (선택)',
    required: false,
    text:
      '맞춤 추천과 자격 비교를 위해 생년월일, 거주지역, 현재 상태, 관심 분야를 선택적으로 수집합니다. 동의하지 않아도 가입할 수 있습니다. 생년월일 원값은 외부 AI에 전송하지 않습니다.',
  },
};

export const AI_NOTICE =
  'AI 비서에게 입력한 질문은 답변 생성을 위해 국외 외부 AI 서비스(OpenAI)로 전송됩니다. 질문에 비밀번호나 민감한 개인정보를 입력하지 마세요.';

const iso = (v) => (v ? new Date(v).toISOString() : null);

// 사용자(app_metadata)에서 동의 현황을 만든다. 가입 기록이 없는 계정은 동의 여부를 null(기록 없음)로 둔다
export function consentView(user) {
  const reg = user?.app_metadata?.registration;
  const c = reg?.consents ?? null;
  const agreedAt = iso(c?.agreedAt);
  return {
    version: c?.version ?? null,
    items: Object.entries(CONSENT_DOCS).map(([key, doc]) => {
      const agreed = c ? Boolean(c[key]) : null;
      return {
        key,
        title: doc.title,
        required: doc.required,
        text: doc.text,
        agreed,
        // 필수 동의는 가입 때, 선택 동의는 마지막으로 바꾼 때
        at:
          key === 'personalization'
            ? iso(c?.personalizationChangedAt) ?? (agreed ? agreedAt : null)
            : agreed ? agreedAt : null,
        revokedAt: key === 'personalization' && agreed === false ? iso(c?.personalizationChangedAt ?? c?.revokedAt) : null,
      };
    }),
    aiNotice: AI_NOTICE,
  };
}

export function createConsentService({ db = supabase, change = changePersonal, now = () => new Date() } = {}) {
  const checked = ({ error }) => {
    if (error) throw error;
  };
  return {
    view: consentView,
    async setPersonalization(user, { agree, confirmDelete } = {}) {
      if (typeof agree !== 'boolean') throw new AppError(400, 'INVALID_CONSENT', '동의 여부를 확인해주세요.');
      const current = consentView(user).items.find((i) => i.key === 'personalization');
      if (current.agreed === agree) return consentView(user); // 이미 같은 상태
      if (!agree && confirmDelete !== true)
        throw new AppError(
          400,
          'CONFIRM_REQUIRED',
          '동의를 철회하면 저장한 맞춤정보(생년월일·거주지역·현재 상태·관심 분야 등)가 삭제돼요. 확인 후 다시 요청해주세요.'
        );
      const stamp = now().toISOString();
      const meta = user.app_metadata ?? {};
      const reg = meta.registration ?? {};
      const next = {
        ...meta,
        registration: {
          ...reg,
          consents: { ...(reg.consents ?? {}), personalization: agree, personalizationChangedAt: stamp },
        },
      };
      if (!agree) {
        // 맞춤정보 삭제: 프로필 행과 암호화해 둔 민감 항목
        checked(await db.from('user_profile').delete().eq('user_id', user.id));
        await change(user.id, (state) => {
          delete state.sensitiveProfile;
        });
      }
      checked(await db.auth.admin.updateUserById(user.id, { app_metadata: next }));
      return consentView({ ...user, app_metadata: next });
    },
  };
}

export const consents = createConsentService();
