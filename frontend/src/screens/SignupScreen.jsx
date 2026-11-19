import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase, useAuth } from '../lib/auth.jsx';
import { signupApi } from '../lib/signup.js';
import rules from '../../../shared/signup-rules.mjs';
import './SignupScreen.css';

const pendingKey = 'cheonghae-signup-request';
function readPending() {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    return typeof value?.challengeId === 'string' &&
      typeof value.email === 'string' &&
      Number.isFinite(value.expiresAt) &&
      Number.isFinite(value.resendAt)
      ? value
      : null;
  } catch {
    return null;
  }
}

export default function SignupScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, ready } = useAuth();
  const [fields, setFields] = useState({
    username: '',
    nickname: '',
    email: params.get('email') || '',
    password: '',
    confirmation: '',
    ageConfirmed: false,
    terms: false,
    privacy: false,
    personalization: false,
  });
  const [checkedUsername, setCheckedUsername] = useState('');
  const [checkedEmail, setCheckedEmail] = useState('');
  const [checkResults, setCheckResults] = useState({});
  const [checkingField, setCheckingField] = useState('');
  const [pending, setPending] = useState(readPending);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [shown, setShown] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user || pending || busy || user.app_metadata?.registration_pending) return;
    const registration = user.app_metadata?.registration;
    navigate(
      registration?.consents?.personalization && !registration.onboardingCompleted
        ? '/onboarding'
        : '/',
      { replace: true }
    );
  }, [user, pending, busy, navigate]);
  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors({});
    setMessage('');
    if (key === 'username') setCheckedUsername('');
    if (key === 'email') setCheckedEmail('');
    if (key === 'username' || key === 'email')
      setCheckResults((current) => ({ ...current, [key]: null }));
  }
  function remember(value) {
    // State still updates if browser storage is unavailable; no password or OTP is persisted.
    setPending(value);
    try {
      if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
      else sessionStorage.removeItem(pendingKey);
    } catch {
      /* Current tab can continue. */
    }
  }
  async function run(action, errorField) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    if(errorField){
      setCheckingField(errorField);
      if(errorField==='username')setCheckedUsername('');
      if(errorField==='email')setCheckedEmail('');
      setCheckResults(current=>({...current,[errorField]:null}));
      setErrors(current=>({...current,[errorField]:undefined}));
    }
    try {
      await action();
    } catch (error) {
      const text=error instanceof Error ? error.message : '요청을 처리하지 못했어요.';
      if(errorField)setErrors(current=>({...current,[errorField]:text}));
      else setMessage(text);
    } finally {
      lock.current = false;
      setBusy(false);
      setCheckingField('');
    }
  }
  async function checkUsername() {
    await run(async () => {
      const result = await signupApi('/username/check', { username: fields.username });
      if(typeof result?.available!=='boolean'||typeof result?.username!=='string')throw Error('아이디 확인 결과를 받지 못했어요. 다시 시도해주세요.');
      setCheckedUsername(result.available ? result.username : '');
      setCheckResults((current) => ({ ...current, username: result.available }));
    },'username');
  }
  async function checkEmail() {
    await run(async () => {
      const email = fields.email.trim().toLowerCase();
      const result = await signupApi('/email/check', { email });
      if(typeof result?.available!=='boolean')throw Error('이메일 확인 결과를 받지 못했어요. 다시 시도해주세요.');
      setCheckedEmail(result.available ? email : '');
      setCheckResults((current) => ({ ...current, email: result.available }));
    },'email');
  }
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !ready) return;
    const input = {
      ...fields,
      email: fields.email.trim().toLowerCase(),
      nickname: fields.nickname.trim(),
    };
    const invalid = rules.signupErrors(input);
    if (checkedUsername !== input.username) invalid.username = '아이디 중복 확인을 해주세요.';
    if (checkedEmail !== input.email) invalid.email = '이메일 중복 확인을 해주세요.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    await run(async () => {
      const result = await signupApi('/signup', input);
      remember(result);
      if (result.notice) setMessage(result.notice);
      setToken('');
      setFields((current) => ({ ...current, password: '', confirmation: '' }));
      setClock(Date.now());
    });
  }
  async function verify(event) {
    event.preventDefault();
    if (!pending) return;
    if (!pending.verified && !/^\d{6}$/.test(token)) {
      setMessage('6자리 숫자 인증번호를 입력해주세요.');
      return;
    }
    await run(async () => {
      if (!pending.verified) {
        const result = await signupApi('/signup/verify', {
          challengeId: pending.challengeId,
          token,
        });
        const { error } = await supabase.auth.setSession(result.session);
        if (error) throw error;
        remember({ ...pending, verified: true });
        setToken('');
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error('인증 세션을 다시 확인해주세요.');
      const result = await signupApi(
        '/signup/complete',
        { challengeId: pending.challengeId },
        session.access_token
      );
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      remember(null);
      navigate(result.next, { replace: true });
    });
  }
  const resendWait = pending ? Math.max(0, Math.ceil((pending.resendAt - clock) / 1000)) : 0;
  const seconds = pending ? Math.max(0, Math.ceil((pending.expiresAt - clock) / 1000)) : 0;
  const fieldError = (key) =>
    errors[key] && (
      <p className="signup-field-message message-error" role="alert">
        {errors[key]}
      </p>
    );
  return (
    <main className="signup-page mx-auto max-w-[480px]" aria-labelledby="signup-title">
      <section className="signup-card">
        <button
          type="button"
          className="signup-back-button"
          aria-label="마이 화면으로 돌아가기"
          disabled={busy}
          onClick={() => navigate('/my')}
        >
          <ChevronLeft size={20} />
        </button>
        <h1 id="signup-title" className="signup-title">
          회원가입
        </h1>
        {pending ? (
          <form onSubmit={verify} className="signup-confirmation" aria-busy={busy}>
            <h2>이메일 인증번호 확인</h2>
            <p>
              <strong>{pending.email}</strong>로 받은 6자리 인증번호를 입력해주세요.
            </p>
            {!pending.verified && (
              <>
                <label className="signup-label" htmlFor="signup-token">
                  인증번호
                </label>
                <input
                  id="signup-token"
                  className="signup-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                />
                <p role="timer">
                  {seconds
                    ? `남은 시간 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                    : '인증번호가 만료됐어요. 다시 발송해주세요.'}
                </p>
                <p>5분 동안 유효하며, 5회 틀리면 다시 발송해야 해요.</p>
              </>
            )}
            <button
              type="submit"
              className="signup-submit-button"
              disabled={busy || (!pending.verified && !seconds)}
            >
              {pending.verified ? '가입 완료하기' : '인증하고 가입 완료하기'}
            </button>
            {!pending.verified && (
              <>
                <button
                  type="button"
                  className="signup-login-link"
                  disabled={busy || resendWait > 0}
                  onClick={() =>
                    run(async () => {
                      const times = await signupApi('/signup/resend', {
                        challengeId: pending.challengeId,
                      });
                      remember({ ...pending, ...times });
                      setToken('');
                      setClock(Date.now());
                      setMessage('새 인증번호를 발송했어요. 이전 번호는 사용할 수 없어요.');
                    })
                  }
                >
                  {resendWait ? `인증번호 재발송 (${resendWait}초)` : '인증번호 재발송'}
                </button>
                <button
                  type="button"
                  className="signup-login-link"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await signupApi('/signup/cancel', { challengeId: pending.challengeId });
                      remember(null);
                      setToken('');
                      setCheckedEmail('');
                      setCheckedUsername('');
                    })
                  }
                >
                  가입 정보 수정
                </button>
              </>
            )}
          </form>
        ) : (
          <form className="signup-form" onSubmit={submit} noValidate aria-busy={busy}>
            <p className="signup-description">계정 정보를 입력하고 이메일을 인증해주세요.</p>
            <fieldset className="signup-fields" disabled={busy || !ready}>
              <div>
                <label className="signup-label" htmlFor="signup-nickname">
                  닉네임
                </label>
                <input
                  className="signup-input"
                  id="signup-nickname"
                  autoComplete="nickname"
                  maxLength={10}
                  value={fields.nickname}
                  onChange={(e) => update('nickname', e.target.value)}
                  aria-invalid={!!errors.nickname}
                />
                <p className="signup-password-guide">
                  한글·영문·숫자 2~10자. 실명은 입력하지 않아도 돼요.
                </p>
                {fieldError('nickname')}
              </div>
              <div>
                <label className="signup-label" htmlFor="signup-username">
                  아이디
                </label>
                <div className="signup-input-wrapper">
                  <input
                    className="signup-input"
                    id="signup-username"
                    autoComplete="username"
                    maxLength={15}
                    value={fields.username}
                    onChange={(e) => update('username', e.target.value.toLowerCase())}
                    aria-invalid={!!errors.username || checkResults.username === false}
                  />
                  <button type="button" className="signup-check-button" onClick={checkUsername}>
                    {checkingField==='username'?'확인 중…':'아이디 중복 확인'}
                  </button>
                </div>
                <p className="signup-password-guide">
                  영문 소문자로 시작하는 8~15자의 영문 소문자·숫자
                </p>
                {checkResults.username != null && <p
                  className={`signup-field-message ${checkResults.username ? 'message-success' : 'message-error'}`}
                  role="status" aria-live="polite">
                  {checkResults.username ? '사용할 수 있는 아이디예요. 아이디 중복 확인 완료' : '이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요.'}
                </p>}
                {fieldError('username')}
              </div>
              <div>
                <label className="signup-label" htmlFor="signup-email">
                  이메일
                </label>
                <div className="signup-input-wrapper">
                  <input
                    className="signup-input"
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={fields.email}
                    onChange={(e) => update('email', e.target.value)}
                    aria-invalid={!!errors.email || checkResults.email === false}
                  />
                  <button type="button" className="signup-check-button" onClick={checkEmail}>
                    {checkingField==='email'?'확인 중…':'이메일 중복 확인'}
                  </button>
                </div>
                {checkResults.email != null && <p
                  className={`signup-field-message ${checkResults.email ? 'message-success' : 'message-error'}`}
                  role="status" aria-live="polite">
                  {checkResults.email ? '사용할 수 있는 이메일이에요. 이메일 중복 확인 완료' : '이미 가입했거나 인증 진행 중인 이메일이에요. 다른 이메일을 입력하거나 로그인해주세요.'}
                </p>}
                {fieldError('email')}
              </div>
              {['password', 'confirmation'].map((key) => (
                <div key={key}>
                  <label className="signup-label" htmlFor={'signup-' + key}>
                    {key === 'password' ? '비밀번호' : '비밀번호 확인'}
                  </label>
                  <div className="signup-password-wrapper">
                    <input
                      className="signup-input signup-secret"
                      id={'signup-' + key}
                      type={shown === key ? 'text' : 'password'}
                      autoComplete="new-password"
                      maxLength={15}
                      value={fields[key]}
                      onChange={(e) => update(key, e.target.value)}
                      onBlur={() => setShown('')}
                      aria-invalid={!!errors[key]}
                    />
                    <button
                      type="button"
                      className="signup-password-toggle"
                      aria-label={(key === 'password' ? '비밀번호' : '비밀번호 확인') + ' 표시하기'}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setShown(key);
                      }}
                      onPointerUp={() => setShown('')}
                      onPointerCancel={() => setShown('')}
                      onLostPointerCapture={() => setShown('')}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          setShown(key);
                        }
                      }}
                      onKeyUp={() => setShown('')}
                      onBlur={() => setShown('')}
                    >
                      {shown === key ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldError(key)}
                </div>
              ))}
              <p className="signup-password-guide">
                8~15자, 영문·숫자·특수문자를 각각 포함해주세요.
                <br />
                허용 특수문자: ! @ # $ % ^ &amp; * ( ) _ + - =<br />눈 버튼을 누르는 동안만
                비밀번호가 보여요.
              </p>
              <label className="signup-consent">
                <input
                  type="checkbox"
                  checked={fields.ageConfirmed}
                  onChange={(e) => update('ageConfirmed', e.target.checked)}
                />
                만 14세 이상입니다 (필수)
              </label>
              {fieldError('ageConfirmed')}
              <details className="signup-policy">
                <summary>서비스 이용약관 보기</summary>
                <p>
                  청해는 청년 정책 정보를 안내하는 수업 프로젝트입니다. 정책의 최종 신청 자격과 접수
                  여부는 공식 기관 안내를 확인해주세요. 다른 사람의 계정이나 정보를 사용하면 안
                  됩니다.
                </p>
              </details>
              <label className="signup-consent">
                <input
                  type="checkbox"
                  checked={fields.terms}
                  onChange={(e) => update('terms', e.target.checked)}
                />
                서비스 이용약관 동의 (필수)
              </label>
              <details className="signup-policy">
                <summary>개인정보 수집·이용 안내</summary>
                <p>
                  계정 식별·인증과 서비스 제공을 위해 아이디, 닉네임, 이메일, 인증·동의 기록과
                  서비스 이용 기록을 처리합니다. 비밀번호는 인증 서비스가 해시로 보관합니다. 필수
                  동의를 거부하면 가입할 수 없습니다.
                </p>
              </details>
              <label className="signup-consent">
                <input
                  type="checkbox"
                  checked={fields.privacy}
                  onChange={(e) => update('privacy', e.target.checked)}
                />
                계정 정보·서비스 이용 기록 수집·이용 동의 (필수)
              </label>
              <details className="signup-policy">
                <summary>맞춤정보 수집·이용 안내</summary>
                <p>
                  맞춤 추천과 자격 비교를 위해 생년월일, 거주지역, 현재 상태, 관심 분야를 선택적으로
                  수집합니다. 동의하지 않아도 가입할 수 있습니다. 생년월일 원값은 외부 AI에 전송하지
                  않습니다.
                </p>
              </details>
              <label className="signup-consent">
                <input
                  type="checkbox"
                  checked={fields.personalization}
                  onChange={(e) => update('personalization', e.target.checked)}
                />
                맞춤정보 수집·이용 동의 (선택)
              </label>
              {fieldError('consents')}
              <p className="signup-ai-notice">
                AI 비서에게 입력한 질문은 답변 생성을 위해 국외 외부 AI 서비스(OpenAI)로 전송됩니다.
                질문에 비밀번호나 민감한 개인정보를 입력하지 마세요.
              </p>
              <button type="submit" className="signup-submit-button">
                {busy ? '요청 중…' : '인증번호 발송'}
              </button>
            </fieldset>
          </form>
        )}
        {message && (
          <p className="signup-field-message" role="alert">
            {message}
          </p>
        )}
        <div className="signup-login-row">
          <span>이미 계정이 있으신가요?</span>
          <button
            type="button"
            className="signup-login-link"
            disabled={busy}
            onClick={() => navigate('/login')}
          >
            로그인
          </button>
        </div>
      </section>
    </main>
  );
}
