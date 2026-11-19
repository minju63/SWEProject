import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth, supabase } from '../lib/auth';
import { useAppState } from '../app/AppState';
import { busanRegions } from '../data/regions';
import { statusOptions, interestOptions } from '../data/conditions';
import rules from '../../../shared/signup-rules.mjs';
import './SignupScreen.css';
const skipMessage =
  '맞춤정보가 없으면 맞춤 추천과 신청 가능 여부를 정확히 알려드릴 수 없어요. 마이 › 프로필 및 맞춤정보에서 언제든 설정할 수 있어요.';
export default function OnboardingScreen() {
  const { user, ready } = useAuth(),
    { profile, setProfile, workspaceReady } = useAppState(),
    navigate = useNavigate();
  const [birth, setBirth] = useState(''),
    [region, setRegion] = useState(''),
    [province, setProvince] = useState(''),
    [status, setStatus] = useState(''),
    [interests, setInterests] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [skip, setSkip] = useState(false);
  const registration = user?.app_metadata?.registration;
  useEffect(() => {
    if (!ready) return;
    if (!user) navigate('/login', { replace: true });
    else if (!registration?.consents?.personalization || registration.onboardingCompleted)
      navigate('/', { replace: true });
  }, [
    ready,
    user,
    registration?.consents?.personalization,
    registration?.onboardingCompleted,
    navigate,
  ]);
  async function finish(skipped) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw Error('로그인이 필요해요.');
    const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
    const r = await fetch(base + '/auth/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ skipped }),
    });
    if (!r.ok) throw Error('완료 상태를 저장하지 못했어요. 다시 시도해주세요.');
    await supabase.auth.refreshSession();
    navigate('/', { replace: true, state: skipped ? { onboardingSkipped: true } : undefined });
  }
  async function save(e) {
    e.preventDefault();
    const problem = birth ? rules.birthDateError(birth) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await setProfile({
        ...profile,
        name: user?.user_metadata?.display_name || profile.name,
        birthDate: birth,
        region,
        status,
        interests,
      });
      if (!saved) throw Error('맞춤정보를 저장하지 못했어요.');
      await finish(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  if (!ready || !user) return <p role="status">계정 정보를 확인하고 있어요.</p>;
  return (
    <main className="signup-page mx-auto max-w-[480px]">
      <h1 className="signup-title">맞춤정보 초기 설정</h1>
      <p className="signup-description">나에게 맞는 정책을 찾기 위한 정보를 입력해주세요.</p>
      <form className="signup-form" onSubmit={save}>
        <fieldset className="signup-fields" disabled={busy || !workspaceReady}>
          <label className="signup-label">
            생년월일
            <input
              className="signup-input"
              type="date"
              value={birth}
              max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}
              onChange={(e) => setBirth(e.target.value)}
            />
          </label>
          <label className="signup-label">
            시·도
            <select
              className="signup-input"
              value={province}
              aria-label="시·도"
              onChange={(e) => {
                setProvince(e.target.value);
                setRegion('');
              }}
            >
              <option value="">선택해주세요</option>
              <option>부산광역시</option>
            </select>
          </label>
          <label className="signup-label">
            시·군·구
            <select
              className="signup-input"
              value={region}
              aria-label="시·군·구"
              disabled={!province}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">선택해주세요</option>
              {Object.entries(busanRegions)
                .filter(([k]) => k !== '26')
                .map(([k, v]) => (
                  <option key={k} value={v}>
                    {v.replace('부산광역시 ', '')}
                  </option>
                ))}
            </select>
          </label>
          <label className="signup-label">
            현재 상태
            <select
              className="signup-input"
              value={status}
              aria-label="현재 상태"
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">선택해주세요</option>
              {statusOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="signup-label">관심 분야 (여러 개 선택 가능)</legend>
            {interestOptions.map((v) => (
              <label key={v} className="signup-consent">
                <input
                  type="checkbox"
                  checked={interests.includes(v)}
                  onChange={() =>
                    setInterests((current) =>
                      current.includes(v) ? current.filter((x) => x !== v) : [...current, v]
                    )
                  }
                />
                {v}
              </label>
            ))}
          </fieldset>
          <button className="signup-submit-button" type="submit">
            저장하고 시작하기
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      <button className="signup-login-link" disabled={busy} onClick={() => setSkip(true)}>
        건너뛰기
      </button>
      {skip && (
        <section role="dialog" aria-label="맞춤정보 건너뛰기">
          <p>{skipMessage}</p>
          <button className="signup-check-button" onClick={() => setSkip(false)}>
            계속 입력하기
          </button>
          <button
            className="signup-check-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await finish(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : '저장하지 못했어요.');
              } finally {
                setBusy(false);
              }
            }}
          >
            건너뛰고 홈으로
          </button>
        </section>
      )}
    </main>
  );
}
