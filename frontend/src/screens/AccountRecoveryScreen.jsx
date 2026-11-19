import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { signupApi } from '../lib/signup.js';
import { supabase, useAuth } from '../lib/auth';
import { personalApi } from '../lib/api';
import PressPasswordInput from '../components/PressPasswordInput.jsx';
import rules from '../../../shared/signup-rules.mjs';
import './SignupScreen.css';
export default function AccountRecoveryScreen() {
  const findId = useLocation().pathname === '/find-username',
    navigate = useNavigate();
  const isChange = useLocation().pathname === '/settings/password';
  const { user } = useAuth();
  const request = (step, body) =>
    isChange
      ? personalApi('/account/password/' + step, 'POST', step === 'start' ? {} : body)
      : signupApi('/password-reset/' + step, body);
  const [email, setEmail] = useState(''),
    [username, setUsername] = useState(''),
    [pending, setPending] = useState(null),
    [token, setToken] = useState(''),
    [grant, setGrant] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [unregistered, setUnregistered] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now),
    [done, setDone] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error.message || '요청하지 못했어요. 다시 시도해주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const remaining = pending ? Math.max(0, Math.ceil((pending.expiresAt - clock) / 1000)) : 0,
    wait = pending ? Math.max(0, Math.ceil((pending.resendAt - clock) / 1000)) : 0;
  async function submit(e) {
    e.preventDefault();
    await run(async () => {
      if (findId) {
        const result = await signupApi('/find-username', { email });
        setUnregistered(!result.registered);
        setDone(!!result.registered);
        setMessage(
          result.registered ? result.message : '가입되지 않은 이메일입니다. 회원가입하시겠습니까?'
        );
        return;
      }
      if (!pending) {
        const result = await request('start', { email, username });
        setPending(result);
        setToken('');
        return;
      }
      if (!grant) {
        if (!/^\d{6}$/.test(token)) throw Error('6자리 숫자 인증번호를 입력해주세요.');
        const result = await request('verify', {
          requestId: pending.requestId,
          token,
        });
        setGrant(result.grant);
        setPending({ ...pending, expiresAt: result.expiresAt });
        setToken('');
        return;
      }
      if (!rules.passwordPattern.test(password))
        throw Error('비밀번호는 8~15자로 영문·숫자·허용 특수문자를 포함해주세요.');
      if (password !== confirmation) throw Error('비밀번호가 서로 다릅니다.');
      await request('complete', {
        requestId: pending.requestId,
        grant,
        password,
        confirmation,
      });
      setGrant('');
      setPassword('');
      setConfirmation('');
      setPending(null);
      // Leave the protected route first, so its auth guard cannot replace the success URL.
      await navigate('/login?password=changed', { replace: true });
      await supabase.auth.signOut({ scope: 'local' });
    });
  }
  async function edit() {
    await run(async () => {
      await request('cancel', { requestId: pending.requestId });
      setPending(null);
      setGrant('');
      setToken('');
      setPassword('');
      setConfirmation('');
    });
  }
  return (
    <main className="signup-page mx-auto max-w-[480px]" aria-labelledby="recovery-title">
      <section className="signup-card">
        <Link to={isChange ? '/settings?view=account' : '/login'} className="signup-description">
          {isChange ? '‹ 계정 설정으로 돌아가기' : '‹ 로그인으로 돌아가기'}
        </Link>
        <h1 className="signup-title" id="recovery-title">
          {isChange ? '비밀번호 변경' : findId ? '아이디 찾기' : '비밀번호 찾기'}
        </h1>
        <p className="signup-description">
          {isChange
            ? '현재 계정의 등록 이메일로 인증한 뒤 비밀번호를 변경해요.'
            : findId
              ? '가입 이메일로 아이디 안내 메일을 보내드려요.'
              : '아이디와 가입 이메일을 확인한 뒤 비밀번호를 재설정해요.'}
        </p>
        <form className="signup-form" onSubmit={submit}>
          <fieldset className="signup-fields" disabled={busy || !!pending || done || isChange}>
            {!findId && (
              <label className="signup-label">
                아이디
                <input
                  className="signup-input"
                  autoComplete="username"
                  value={
                    isChange
                      ? user?.app_metadata?.registration?.username || '이메일 로그인 계정'
                      : username
                  }
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                />
              </label>
            )}
            <label className="signup-label">
              가입 이메일
              <input
                className="signup-input"
                type="email"
                autoComplete="email"
                value={isChange ? user?.email || '' : email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setUnregistered(false);
                  setMessage('');
                }}
                required
              />
            </label>
          </fieldset>
          {pending && !grant && (
            <>
              <label className="signup-label">
                인증번호
                <input
                  className="signup-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                  required
                />
              </label>
              <p role="timer">
                {remaining
                  ? `남은 시간 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                  : '인증번호가 만료됐어요. 다시 발송해주세요.'}
              </p>
              <p className="signup-description">
                5분 동안 유효하며, 5회 틀리면 다시 발송해야 해요.
              </p>
              <button
                type="button"
                className="signup-check-button"
                disabled={busy || wait > 0}
                onClick={() =>
                  run(async () => {
                    const result = await request('resend', {
                      requestId: pending.requestId,
                    });
                    setPending(result);
                    setToken('');
                  })
                }
              >
                {wait ? `${wait}초 후 다시 발송` : '인증번호 다시 발송'}
              </button>
            </>
          )}
          {grant && (
            <fieldset className="signup-fields" disabled={busy}>
              <PressPasswordInput
                label="새 비밀번호"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PressPasswordInput
                label="새 비밀번호 확인"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
              <p className="signup-description">
                8~15자 · 영문·숫자·특수문자 포함 · 공백 제외
                <br />
                허용 특수문자: ! @ # $ % ^ &amp; * ( ) _ + - =
              </p>
            </fieldset>
          )}
          {message && (
            <p role={done ? 'status' : 'alert'} className="signup-field-message">
              {message}
            </p>
          )}
          {unregistered ? (
            <div className="signup-actions">
              <Link
                to={`/signup?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                className="signup-primary-button"
              >
                회원가입
              </Link>
              <button
                type="button"
                className="signup-secondary-button"
                onClick={() => navigate('/login')}
              >
                취소
              </button>
            </div>
          ) : (
            !done && (
              <button
                className="signup-primary-button"
                type="submit"
                disabled={busy || (!!pending && !grant && !remaining)}
              >
                {busy
                  ? '처리 중…'
                  : findId
                    ? '아이디 안내 메일 받기'
                    : !pending
                      ? '인증번호 받기'
                      : !grant
                        ? '인증번호 확인'
                        : isChange
                          ? '비밀번호 변경'
                          : '비밀번호 재설정'}
              </button>
            )
          )}
          {pending && (
            <button
              type="button"
              className="signup-secondary-button"
              disabled={busy}
              onClick={edit}
            >
              정보 수정
            </button>
          )}
          {done && (
            <Link to="/login" className="signup-primary-button">
              로그인으로 이동
            </Link>
          )}
        </form>
      </section>
    </main>
  );
}
