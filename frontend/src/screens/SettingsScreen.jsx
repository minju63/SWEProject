import { BottomNav } from '../components/PolicyLayout';
import { getCompletion } from '../data/profileCompletion';
import './MyDesign.css';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAppState } from '../app/AppState';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/auth';
import { personalApi } from '../lib/api';
import { interestDetailKey, scopedInterestDetails } from '../data/interestSelection';
import AppSelect from '../components/AppSelect';
import { Icon } from './HomeScreen';
import signupRules from '../../../shared/signup-rules.mjs';
import {
  educationOptions,
  educationSub,
  employerOptions,
  headOptions,
  householdOptions,
  housingBenefitOptions,
  housingOptions,
  independentOptions,
  interestOptions,
  maritalOptions,
  NONE,
  NONE_TARGET,
  ownershipOptions,
  specialOptions as specialTargets,
  statusOptions,
  statusSub,
} from '../data/conditions';
const regionOptions = {
  부산광역시: [
    '중구',
    '서구',
    '동구',
    '영도구',
    '부산진구',
    '동래구',
    '남구',
    '북구',
    '해운대구',
    '사하구',
    '금정구',
    '강서구',
    '연제구',
    '수영구',
    '사상구',
    '기장군',
  ],
};
const interestSubOptions = {
  취업·진로: ['취업지원', '채용·인턴', '창업지원', '직무교육', '재직자지원'],
  주거·생활: [
    '청년주택',
    '월세 지원',
    '전세·보증금 지원',
    '이사비 지원',
    '주거상담·계약지원',
    '교통비 지원',
    '공과금·에너지 지원',
  ],
  장학·금융: [
    '장학금',
    '학자금 지원',
    '생활·금융 대출',
    '주거금융',
    '자산형성·저축',
    '신용·채무 지원',
    '취업·구직 지원금',
    '기타',
  ],
  문화: ['뮤지컬', '연극', '콘서트', '클래식', '무용', '오페라', '전통예술', '전시', '기타'],
  공간·시설: ['문화시설', '도서관', '체육시설', '공공시설', '청년공간'],
};
function getProvince(region) {
  return Object.keys(regionOptions).find((province) => region.startsWith(province)) ?? '선택 안 함';
}
function getDistrict(region) {
  const province = getProvince(region);
  return region.slice(province.length).trim() || '선택 안 함';
}
function ProfileCard({ title, badge, children }) {
  return (
    <section className="profile-card rounded-[22px] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-black tracking-[-0.03em]">{title}</h2>
        {badge && (
          <span className="rounded-full bg-[#f1f3fb] px-2.5 py-1 text-[10px] font-black text-[#2468E0]">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
export default function SettingsScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    profile,
    setProfile,
    notificationSettings,
    setNotificationSettings,
    loadNotificationSettings,
    saveNotificationSettings,
    workspaceReady,
  } = useAppState();
  const { user, ready, signOut } = useAuth();
  const [view, setView] = useState(() => {
    const requestedView = searchParams.get('view');
    if (['profile', 'notifications', 'account'].includes(requestedView)) return requestedView;
    return 'menu';
  });
  const [draft, setDraftState] = useState(profile);
  const draftChanged = useRef(false);
  function setDraft(next) {
    draftChanged.current = true;
    setDraftState(next);
  }
  useEffect(() => {
    if (!draftChanged.current) setDraftState(profile);
  }, [profile]);
  useEffect(() => {
    draftChanged.current = false;
    setDraftState(profile);
  }, [user?.id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);
  const [message, setMessage] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  useEffect(() => {
    if (view !== 'notifications' || !user) return;
    let active = true;
    setLoadingNotifications(true);
    setNotificationsLoaded(false);
    loadNotificationSettings()
      .then(() => {
        if (active) setNotificationsLoaded(true);
      })
      .catch(() => {
        if (active) setMessage('알림 설정을 불러오지 못했어요. 다시 열어주세요.');
      })
      .finally(() => {
        if (active) setLoadingNotifications(false);
      });
    return () => {
      active = false;
    };
  }, [view, user, loadNotificationSettings]);
  async function withdraw(event) {
    event.preventDefault();
    if (withdrawing || !withdrawConfirmed) return;
    setWithdrawing(true);
    try {
      const deletion = await personalApi('/account', 'DELETE', { confirmation: '탈퇴' });
      await navigate(
        deletion?.status === 'PENDING' ? '/login?deletion=pending' : '/login?deletion=complete',
        { replace: true }
      );
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '탈퇴하지 못했어요. 다시 시도해주세요.');
    } finally {
      setWithdrawing(false);
    }
  }
  function goBack() {
    if (view === 'menu') navigate('/my');
    else setView('menu');
  }
  async function saveProfile(event) {
    event.preventDefault();
    if (savingProfile) return;
    const name = draft.name.trim();
    if (!signupRules.nicknamePattern.test(name)) {
      setMessage('닉네임은 한글·영문·숫자 2~10자로 입력해주세요.');
      return;
    }
    setSavingProfile(true);
    const saved = await setProfile({ ...draft, name });
    setSavingProfile(false);
    if (!saved) return;
    draftChanged.current = false;
    setMessage('프로필과 맞춤정보를 저장했어요.');
    setView('menu');
  }
  const [openInterest, setOpenInterest] = useState(null);
  function toggleInterest(interest) {
    setDraft((current) => {
      const details = scopedInterestDetails(
        current.interests,
        current.interestDetails ?? [],
        interestSubOptions
      );
      const relatedDetails = (interestSubOptions[interest] ?? []).map((detail) =>
        interestDetailKey(interest, detail)
      );
      const allDetailsSelected =
        relatedDetails.length > 0 && relatedDetails.every((item) => details.includes(item));
      if (allDetailsSelected) {
        return {
          ...current,
          interests: current.interests.filter((item) => item !== interest),
          interestDetails: details.filter((item) => !relatedDetails.includes(item)),
        };
      }
      return {
        ...current,
        interests: current.interests.includes(interest)
          ? current.interests
          : [...current.interests, interest],
        interestDetails: [
          ...details.filter((item) => !relatedDetails.includes(item)),
          ...relatedDetails,
        ],
      };
    });
  }
  function toggleInterestDetail(interest, detail) {
    setDraft((current) => {
      const details = scopedInterestDetails(
        current.interests,
        current.interestDetails ?? [],
        interestSubOptions
      );
      const key = interestDetailKey(interest, detail);
      const selected = details.includes(key);
      const nextDetails = selected ? details.filter((item) => item !== key) : [...details, key];
      const relatedDetails = (interestSubOptions[interest] ?? []).map((detail) =>
        interestDetailKey(interest, detail)
      );
      const hasSelectedDetail = relatedDetails.some((item) => nextDetails.includes(item));
      return {
        ...current,
        interests: hasSelectedDetail
          ? current.interests.includes(interest)
            ? current.interests
            : [...current.interests, interest]
          : current.interests.filter((item) => item !== interest),
        interestDetails: nextDetails,
      };
    });
  }
  function dropdown(label, key, options, sub, wrapClass = 'mt-5') {
    const value = draft[key] ?? '';
    const subOptions = sub ? sub.options[value] : undefined;
    return (
      <div className={wrapClass}>
        <AppSelect
          label={label || undefined}
          value={value || NONE}
          options={[NONE, ...options]}
          onChange={(next) =>
            setDraft((current) => ({
              ...current,
              [key]: next === NONE ? '' : next,
              ...(sub ? { [sub.key]: '' } : {}),
            }))
          }
        />
        {sub && subOptions && (
          <div className="mt-2">
            <AppSelect
              compact
              value={draft[sub.key] || NONE}
              options={[NONE, ...subOptions]}
              onChange={(next) =>
                setDraft((current) => ({ ...current, [sub.key]: next === NONE ? '' : next }))
              }
            />
          </div>
        )}
      </div>
    );
  }
  function toggleSpecialTarget(target) {
    setDraft((current) => {
      const targets = current.specialTargets ?? [];
      if (targets.includes(target))
        return {
          ...current,
          specialTargets: targets.filter((item) => item !== target),
        };
      if (target === NONE_TARGET) return { ...current, specialTargets: [NONE_TARGET] };
      return {
        ...current,
        specialTargets: [...targets.filter((item) => item !== NONE_TARGET), target],
      };
    });
  }
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="my-settings">
        <header className="my-header">
          <button
            onClick={goBack}
            className="-ml-2 grid size-10 place-items-center rounded-full"
            aria-label="뒤로 가기"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <h1 className="ml-1 text-[18px] font-black tracking-[-0.04em]">
            {view === 'menu' && '설정'}
            {view === 'profile' && '프로필 및 맞춤정보'}
            {view === 'notifications' && '맞춤 알림'}
            {view === 'withdrawal' && '회원 탈퇴'}
            {view === 'account' && '계정 설정'}
          </h1>
        </header>

        {view === 'menu' && (
          <main className="px-5 pb-10 pt-5">
            <section className="flex items-center gap-4 rounded-[22px] bg-white p-5">
              <span className="grid size-14 place-items-center rounded-[19px] bg-[#f1f3fb] text-[#2468E0]">
                <Icon name="user" className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-black">{profile.name}님</h2>
                <p className="mt-1 truncate text-[11px] font-semibold text-black/60">
                  {[profile.age, profile.region].filter(Boolean).join(' · ') ||
                    '맞춤정보를 입력해주세요'}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#f1f3fb] px-2.5 py-1.5 text-[10px] font-black text-[#2468E0]">
                맞춤정보 {getCompletion(profile).percent}%
              </span>
            </section>

            {message && (
              <p
                className="mt-4 rounded-xl bg-[#f1f3fb] px-4 py-3 text-xs font-bold text-[#2468E0]"
                role="status"
              >
                {message}
              </p>
            )}

            <section className="mt-7">
              <h2 className="px-1 text-xs font-extrabold text-black/60">개인 설정</h2>
              <div className="mt-2 overflow-hidden rounded-[20px] bg-white">
                <button
                  onClick={() => {
                    draftChanged.current = false;
                    setDraftState(profile);
                    setMessage('');
                    setView('profile');
                  }}
                  className="flex w-full items-center gap-3 border-b border-black/[0.06] p-4 text-left"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#f1f3fb] text-[#2468E0]">
                    <Icon name="user" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm font-extrabold">프로필 및 맞춤정보</b>
                    <small className="mt-1 block text-[10px] font-medium text-black/60">
                      나이, 지역, 현재 상태, 관심 분야
                    </small>
                  </span>
                  <Icon name="arrow" className="size-4 text-black/25" />
                </button>
                <button
                  onClick={() => setView('notifications')}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="relative grid size-10 place-items-center rounded-xl bg-[#f1f3fb] text-[#2468E0]">
                    <Icon name="bell" className="size-5" />
                    {notificationSettings.enabled && (
                      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#2F7BF5]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm font-extrabold">맞춤 알림</b>
                    <small className="mt-1 block text-[10px] font-medium text-black/60">
                      {notificationSettings.enabled
                        ? '맞춤 혜택 · 마감 · 신청 상태 알림'
                        : '알림 꺼짐'}
                    </small>
                  </span>
                  <Icon name="arrow" className="size-4 text-black/25" />
                </button>
              </div>
            </section>

            <section className="mt-7">
              <h2 className="px-1 text-xs font-extrabold text-black/60">계정</h2>
              <div className="mt-2 overflow-hidden rounded-[20px] bg-white">
                <button
                  onClick={() => setView('account')}
                  className="flex w-full items-center justify-between border-b border-black/[0.06] px-4 py-4 text-sm font-extrabold text-black/60"
                >
                  계정 설정 <Icon name="arrow" className="size-4 text-black/25" />
                </button>
                <button
                  onClick={() => setLogoutOpen(true)}
                  className="flex w-full items-center justify-between px-4 py-4 text-sm font-extrabold text-black/60"
                >
                  로그아웃 <Icon name="arrow" className="size-4 text-black/25" />
                </button>
              </div>
            </section>

            <section className="mt-7">
              <h2 className="px-1 text-xs font-extrabold text-black/60">서비스 정보</h2>
              <div className="mt-2 overflow-hidden rounded-[20px] bg-white">
                <button
                  onClick={() => navigate('/settings/consents?open=terms')}
                  className="flex w-full items-center justify-between border-b border-black/[0.06] px-4 py-4 text-sm font-extrabold text-black/60"
                >
                  이용약관 <Icon name="arrow" className="size-4 text-black/25" />
                </button>
                <button
                  onClick={() => navigate('/settings/consents?open=privacy')}
                  className="flex w-full items-center justify-between border-b border-black/[0.06] px-4 py-4 text-sm font-extrabold text-black/60"
                >
                  개인정보처리방침 <Icon name="arrow" className="size-4 text-black/25" />
                </button>
                <button
                  onClick={() => navigate('/settings/consents')}
                  className="flex w-full items-center justify-between px-4 py-4 text-sm font-extrabold text-black/60"
                >
                  약관 및 동의 관리 <Icon name="arrow" className="size-4 text-black/25" />
                </button>
              </div>
            </section>
          </main>
        )}

        {view === 'profile' && (
          <form onSubmit={saveProfile} className="px-5 pb-10 pt-5">
            <fieldset
              disabled={!ready || (Boolean(user) && !workspaceReady) || savingProfile}
              className="contents"
            >
              {message && (
                <p role="alert" className="my-profile-notice">
                  {message}
                </p>
              )}
              <p className="my-profile-notice">
                ⓘ 맞춤정보 {getCompletion(draft).percent}% ·{' '}
                {getCompletion(draft).percent === 100
                  ? '입력한 정보를 바탕으로 혜택을 추천해드려요.'
                  : '빈 항목을 입력하면 더 잘 맞는 혜택을 찾을 수 있어요.'}
              </p>
              <p className="mb-4 text-xs leading-5 text-black/60">
                닉네임을 제외한 항목은 선택사항이에요. 생년월일은 비우고, 선택 항목은 ‘선택 안 함’
                또는 선택 해제로 지울 수 있어요. 혼인 상태·주거급여 수급 여부·특화대상은 맞춤 추천과
                신청 조건 비교에만 사용해요. 입력하지 않아도 검색·지도·캘린더와 기본 추천을 이용할
                수 있어요.
              </p>
              <div className="space-y-4">
                <ProfileCard title="기본 정보">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-bold text-black/60">
                      닉네임
                      <input
                        required
                        minLength={2}
                        maxLength={10}
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-3 py-3 text-sm font-bold text-black outline-none"
                      />
                    </label>
                    <label className="block text-xs font-bold text-black/60">
                      생년월일
                      <input
                        type="date"
                        max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}
                        value={draft.birthDate ?? ''}
                        onChange={(e) =>
                          setDraft((current) => ({ ...current, birthDate: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl bg-[#f3f4f7] px-3 py-3 text-sm font-bold text-black"
                      />
                      <span className="mt-1 block text-[10px]">
                        만 나이는 생년월일을 기준으로 계산해요.
                      </span>
                    </label>
                  </div>
                  <fieldset className="mt-3">
                    <legend className="text-xs font-bold text-black/60">거주지역</legend>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <AppSelect
                        label="시·도"
                        value={getProvince(draft.region)}
                        options={['선택 안 함', ...Object.keys(regionOptions)]}
                        onChange={(province) =>
                          setDraft((current) => ({
                            ...current,
                            region: province === '선택 안 함' ? '' : province,
                          }))
                        }
                      />
                      <AppSelect
                        label="시·군·구"
                        value={draft.region ? getDistrict(draft.region) : '선택 안 함'}
                        options={[
                          '선택 안 함',
                          ...(regionOptions[getProvince(draft.region)] || []),
                        ]}
                        disabled={!draft.region}
                        onChange={(district) =>
                          setDraft((current) => ({
                            ...current,
                            region:
                              district === '선택 안 함'
                                ? ''
                                : `${getProvince(current.region)} ${district}`,
                          }))
                        }
                      />
                    </div>
                  </fieldset>
                </ProfileCard>

                <ProfileCard title="학력 및 현재 상태">
                  <div className="grid grid-cols-2 items-start gap-3">
                    {dropdown(
                      '최종학력',
                      'education',
                      educationOptions,
                      { key: 'educationDetail', options: educationSub },
                      ''
                    )}
                    {dropdown(
                      '현재 상태',
                      'status',
                      statusOptions,
                      { key: 'statusDetail', options: statusSub },
                      ''
                    )}
                  </div>
                </ProfileCard>

                <ProfileCard title="주거 및 가구 정보">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                    {dropdown('현재 주거 형태', 'housingType', housingOptions, undefined, '')}
                    {dropdown('가구 구성', 'householdType', householdOptions, undefined, '')}
                    {dropdown(
                      '독립거주 여부',
                      'independentLiving',
                      independentOptions,
                      undefined,
                      ''
                    )}
                    {dropdown('주택 소유 여부', 'homeOwnership', ownershipOptions, undefined, '')}
                    {dropdown('세대주 여부', 'headOfHousehold', headOptions, undefined, '')}
                    {dropdown(
                      '주거급여 수급 여부',
                      'housingBenefit',
                      housingBenefitOptions,
                      undefined,
                      ''
                    )}
                  </div>
                </ProfileCard>

                <ProfileCard title="직업 및 기업 정보">
                  {dropdown('재직 기업 유형', 'employerType', employerOptions, undefined, '')}
                </ProfileCard>

                <div className="pt-4">
                  <ProfileCard title="혼인 상태" badge="하나만 선택">
                    <div className="my-marital-options" role="group" aria-label="혼인 상태">
                      {maritalOptions.map((value) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={draft.maritalStatus === value}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              maritalStatus: draft.maritalStatus === value ? '' : value,
                            })
                          }
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </ProfileCard>
                </div>

                <div className="pt-4">
                  <ProfileCard title="특화대상" badge="복수선택 가능">
                    <p className="-mt-2 text-[11px] font-medium text-black/60">
                      해당하는 항목을 모두 선택해주세요.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5" role="group" aria-label="특화대상">
                      {[NONE_TARGET, ...specialTargets].map((target) => {
                        const selected = (draft.specialTargets ?? []).includes(target);
                        return (
                          <button
                            type="button"
                            key={target}
                            aria-pressed={selected}
                            onClick={() => toggleSpecialTarget(target)}
                            className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-4 text-[14px] font-bold leading-tight transition-colors ${
                              selected
                                ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
                                : 'border-black/12 bg-white text-black/60'
                            }`}
                          >
                            <span
                              className={`grid size-[18px] shrink-0 place-items-center rounded-[6px] border ${
                                selected
                                  ? 'border-white bg-white text-[#2468E0]'
                                  : 'border-black/20 bg-white text-transparent'
                              }`}
                            >
                              <svg
                                className="size-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m5 12 5 5L20 7" />
                              </svg>
                            </span>
                            {target}
                          </button>
                        );
                      })}
                    </div>
                  </ProfileCard>
                </div>

                <div className="pt-4">
                  <ProfileCard title="관심 분야" badge="복수선택 가능">
                    <p className="-mt-2 text-[11px] font-medium leading-5 text-black/60">
                      관심 있는 대분류를 선택하고, 카드를 눌러 세부분류를 추가로 선택할 수 있어요.
                    </p>

                    <div className="mt-4 space-y-2.5">
                      {interestOptions.map((interest) => {
                        const open = openInterest === interest;
                        const details = scopedInterestDetails(
                          draft.interests,
                          draft.interestDetails ?? [],
                          interestSubOptions
                        );
                        const options = interestSubOptions[interest] ?? [];
                        const selectedCount = options.filter((item) =>
                          details.includes(interestDetailKey(interest, item))
                        ).length;
                        const allSelected = options.length > 0 && selectedCount === options.length;
                        const partiallySelected =
                          selectedCount > 0 && selectedCount < options.length;
                        const selected = draft.interests.includes(interest) || selectedCount > 0;
                        return (
                          <div
                            key={interest}
                            data-interest={interest}
                            className={`overflow-hidden rounded-2xl border transition-colors ${
                              selected
                                ? 'border-[#2F7BF5]/35 bg-[#f8f9ff]'
                                : 'border-black/[0.07] bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-3 px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => toggleInterest(interest)}
                                aria-pressed={allSelected}
                                aria-label={`${interest} 전체 선택`}
                                className={`grid size-6 shrink-0 place-items-center rounded-[8px] border transition-colors ${
                                  allSelected || partiallySelected
                                    ? 'border-[#2F7BF5] bg-[#2F7BF5] text-white'
                                    : 'border-black/15 bg-white text-transparent'
                                }`}
                              >
                                {partiallySelected ? (
                                  <span className="h-0.5 w-2.5 rounded-full bg-white" />
                                ) : (
                                  <svg
                                    className="size-3.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="m5 12 5 5 9-10" />
                                  </svg>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setOpenInterest((current) =>
                                    current === interest ? null : interest
                                  )
                                }
                                className="flex min-w-0 flex-1 items-center text-left"
                                aria-label={interest}
                                aria-expanded={open}
                              >
                                <span className="min-w-0 flex-1">
                                  <b
                                    className={`block text-sm font-black ${
                                      selected ? 'text-[#2468E0]' : 'text-black/70'
                                    }`}
                                  >
                                    {interest}
                                  </b>
                                  {selectedCount > 0 && (
                                    <small className="mt-0.5 block text-[10px] font-bold text-black/60">
                                      세부 {selectedCount}/{options.length}
                                    </small>
                                  )}
                                </span>

                                <svg
                                  className={`size-4 shrink-0 text-black/30 transition-transform ${open ? 'rotate-180' : ''}`}
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </button>
                            </div>

                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-200 ${
                                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                              }`}
                            >
                              <div className="min-h-0 overflow-hidden">
                                <div className="border-t border-black/[0.06] px-4 pb-4 pt-3">
                                  <p className="mb-3 text-[10px] font-semibold text-black/60">
                                    세부분류는 여러 개 선택할 수 있어요.
                                  </p>

                                  <div className="flex flex-wrap gap-2">
                                    {options.map((detail) => {
                                      const detailSelected = details.includes(
                                        interestDetailKey(interest, detail)
                                      );
                                      return (
                                        <button
                                          type="button"
                                          key={detail}
                                          aria-pressed={detailSelected}
                                          onClick={() => toggleInterestDetail(interest, detail)}
                                          className={`rounded-full px-3 py-2 text-[11px] font-extrabold transition-colors ${
                                            detailSelected
                                              ? 'bg-[#2F7BF5] text-white'
                                              : 'bg-[#f3f4f7] text-black/60'
                                          }`}
                                        >
                                          {detail}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-[10px] font-medium leading-4 text-black/30">
                      대분류 체크박스를 누르면 해당 세부분류가 모두 선택돼요. 카드를 펼친 뒤
                      세부분류를 하나씩 선택하거나 해제할 수 있어요.
                    </p>
                  </ProfileCard>
                </div>
              </div>
              <button
                disabled={savingProfile}
                className="my-profile-save mt-6 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {savingProfile ? '저장 중…' : '변경사항 저장'}
              </button>
            </fieldset>
          </form>
        )}

        {view === 'notifications' && (
          <main className="px-5 pb-10 pt-5" aria-busy={loadingNotifications || savingNotifications}>
            {loadingNotifications && <p role="status">알림 설정을 불러오고 있어요.</p>}
            {message && (
              <p role="alert" className="mb-4 rounded-xl bg-white p-3 text-sm">
                {message}
              </p>
            )}
            <div className="rounded-[22px] bg-white px-5">
              <div className="flex items-center gap-3 border-b border-black/[0.06] py-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">전체 알림</p>
                  <p className="mt-1 text-[10px] font-medium text-black/60">
                    청해의 알림을 한 번에 켜거나 끌 수 있어요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setNotificationSettings((settings) => ({
                      ...settings,
                      enabled: !settings.enabled,
                    }))
                  }
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    notificationSettings.enabled ? 'bg-[#2F7BF5]' : 'bg-black/15'
                  }`}
                  role="switch"
                  aria-label="전체 알림"
                  disabled={!notificationsLoaded || loadingNotifications || savingNotifications}
                  aria-checked={notificationSettings.enabled}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all ${notificationSettings.enabled ? 'left-6' : 'left-1'}`}
                  />
                </button>
              </div>

              <div
                className={
                  notificationSettings.enabled && !loadingNotifications && !savingNotifications
                    ? ''
                    : 'pointer-events-none opacity-40'
                }
              >
                {[
                  {
                    key: 'recommendations',
                    title: '맞춤 알림',
                    description: '맞춤 혜택 알림의 수신 여부를 설정해요.',
                  },
                  {
                    key: 'policyAlerts',
                    title: '정책 알림',
                    description: '청년정책 알림의 수신 여부를 설정해요.',
                  },
                  {
                    key: 'eventAlerts',
                    title: '문화행사 알림',
                    description: '공연·전시·문화행사 알림의 수신 여부를 설정해요.',
                  },
                  {
                    key: 'facilityAlerts',
                    title: '주변 시설 알림',
                    description: '거주 구의 청년공간과 시설 알림 수신 여부를 설정해요.',
                  },
                  {
                    key: 'deadlines',
                    title: '마감 임박 알림',
                    description:
                      '찜하거나 신청 준비 중인 혜택이 마감 7일 이하로 남으면 알려드려요.',
                  },
                  {
                    key: 'applicationUpdates',
                    title: '신청 상태 알림',
                    description: '신청 진행 상황 알림의 수신 여부를 설정해요.',
                  },
                ].map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-center gap-3 border-b border-black/[0.06] py-4 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold">{setting.title}</p>
                      <p className="mt-1 text-[10px] font-medium leading-4 text-black/60">
                        {setting.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNotificationSettings((settings) => ({
                          ...settings,
                          [setting.key]: !settings[setting.key],
                        }))
                      }
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                        notificationSettings[setting.key] ? 'bg-[#2F7BF5]' : 'bg-black/15'
                      }`}
                      role="switch"
                      aria-label={setting.title}
                      disabled={
                        !notificationsLoaded ||
                        !notificationSettings.enabled ||
                        loadingNotifications ||
                        savingNotifications
                      }
                      aria-checked={notificationSettings[setting.key]}
                    >
                      <span
                        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-all ${
                          notificationSettings[setting.key] ? 'left-5' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`mt-4 rounded-[22px] bg-white p-5 ${
                notificationSettings.enabled && notificationSettings.applicationUpdates
                  ? ''
                  : 'opacity-40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f3fb] text-[#2468E0]">
                  <Icon name="bell" className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-black">신청 상태 알림 안내</p>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-black/60">
                    등록된 신청 진행 알림은 알림 목록에서 확인할 수 있어요.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-2xl bg-[#f7f8fb] p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold text-black/60">
                  <span className="grid size-5 place-items-center rounded-full bg-[#f1f3fb] text-[10px] text-[#2468E0]">
                    ✓
                  </span>
                  준비물은 신청 준비 화면에서 확인
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-black/60">
                  <span className="grid size-5 place-items-center rounded-full bg-[#f1f3fb] text-[10px] text-[#2468E0]">
                    ✓
                  </span>
                  결과 발표일은 신청 관리와 캘린더에서 확인
                </div>
              </div>
            </div>

            <p className="mt-4 px-1 text-[10px] font-medium leading-4 text-black/60">
              전체 알림을 꺼도 각 알림의 개별 설정값은 유지돼요. 다시 전체 알림을 켜면 이전 설정으로
              돌아옵니다.
            </p>

            <button
              type="button"
              disabled={!notificationsLoaded || loadingNotifications || savingNotifications}
              onClick={async () => {
                setSavingNotifications(true);
                setMessage('');
                try {
                  await saveNotificationSettings(notificationSettings);
                  setMessage('알림 설정을 저장했어요.');
                  setView('menu');
                } catch {
                  setMessage('알림 설정을 저장하지 못했어요. 다시 시도해주세요.');
                } finally {
                  setSavingNotifications(false);
                }
              }}
              className="mt-5 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white"
            >
              {savingNotifications ? '저장 중…' : '설정 저장'}
            </button>
          </main>
        )}

        {view === 'account' && (
          <main>
            <section className="my-surface">
              <h2>로그인 계정</h2>
              <p className="my-caption mt-3">현재 아이디</p>
              <p className="mt-1 font-bold">
                {user?.app_metadata?.registration?.username || '별도 아이디 없음 · 이메일 로그인'}
              </p>
              <p className="my-caption mt-3">등록 이메일</p>
              <p className="break-all mt-1 font-bold">{user?.email || '로그인이 필요해요'}</p>
              <button className="my-primary mt-4" onClick={() => navigate('/settings/username')}>
                아이디 변경
              </button>
              <button className="my-primary mt-4" onClick={() => navigate('/settings/email')}>
                이메일 변경
              </button>
              <button className="my-primary mt-4" onClick={() => navigate('/settings/password')}>
                비밀번호 변경
              </button>
            </section>
            <button className="my-primary mt-4" onClick={() => setLogoutOpen(true)}>
              로그아웃
            </button>
            <button
              className="my-more"
              onClick={() => {
                setWithdrawConfirmed(false);
                setView('withdrawal');
              }}
            >
              회원 탈퇴
            </button>
          </main>
        )}

        {view === 'withdrawal' && (
          <form onSubmit={withdraw} className="px-5 pb-10 pt-5">
            {message && (
              <p role="alert" className="my-profile-notice">
                {message}
              </p>
            )}
            <div className="rounded-[22px] bg-white p-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#f1f3fb] text-[#2468E0]">
                <Icon name="user" className="size-6" />
              </span>
              <h2 className="mt-4 text-lg font-black">탈퇴하기 전에 확인해주세요</h2>
              <p className="mt-2 text-xs font-medium leading-5 text-black/60">
                탈퇴하면 삭제된 정보는 다시 복구할 수 없어요. 모든 동의가 철회되며 개인 데이터와
                동의 기록은 7일 이내 삭제합니다.
              </p>
              <ul className="mt-5 space-y-3 rounded-2xl bg-[#f7f8fb] p-4 text-xs font-bold text-black/60">
                <li>계정 정보와 약관·개인정보 동의 기록</li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#2F7BF5]" />
                  프로필 및 맞춤정보
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#2F7BF5]" />
                  찜한 혜택과 최근 본 기록
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#2F7BF5]" />
                  신청 준비물과 신청 현황
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#2F7BF5]" />
                  맞춤 알림 설정
                </li>
              </ul>
              <label className="mt-5 flex items-start gap-3 text-xs font-bold text-black/60">
                <input
                  required
                  type="checkbox"
                  checked={withdrawConfirmed}
                  onChange={(event) => setWithdrawConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 accent-[#2F7BF5]"
                />
                삭제되는 정보를 확인했으며 회원 탈퇴에 동의합니다.
              </label>
            </div>
            <button
              disabled={withdrawing || !withdrawConfirmed}
              className="mt-6 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white disabled:opacity-40"
            >
              {withdrawing ? '탈퇴 처리 중…' : '회원 탈퇴 계속하기'}
            </button>
          </form>
        )}

        <BottomNav active="마이" />
        {logoutOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-6"
            onClick={() => setLogoutOpen(false)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[420px] rounded-[24px] bg-white p-5 shadow-xl"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-[#f1f3fb] text-[#2468E0]">
                <Icon name="user" className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-black">로그아웃할까요?</h2>
              <p className="mt-2 text-xs font-medium leading-5 text-black/60">
                로그아웃하기 전에 저장되지 않은 내용이 없는지 확인해주세요.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setLogoutOpen(false)}
                  className="flex-1 rounded-2xl bg-[#f3f4f7] py-3.5 text-xs font-black text-black/60"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    try {
                      await signOut();
                      setLogoutOpen(false);
                      navigate('/');
                    } catch {
                      setMessage('로그아웃하지 못했어요. 다시 시도해 주세요.');
                    }
                  }}
                  className="flex-1 rounded-2xl bg-[#2F7BF5] py-3.5 text-xs font-black text-white"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
