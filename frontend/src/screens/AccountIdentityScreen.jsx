import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth, supabase } from '../lib/auth';
import { personalApi } from '../lib/api';
import rules from '../../../shared/signup-rules.mjs';
import './SignupScreen.css';

export default function AccountIdentityScreen() {
  const kind = useLocation().pathname.endsWith('/username') ? 'username' : 'email';
  return <IdentityForm key={kind} kind={kind} />;
}
function IdentityForm({ kind }) {
  const { user } = useAuth();
  const label = kind === 'username' ? '아이디' : '이메일';
  const [pending, setPending] = useState(null),
    [proof, setProof] = useState(''),
    [token, setToken] = useState('');
  const [newValue, setNewValue] = useState(''),
    [newSent, setNewSent] = useState(false);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [clock, setClock] = useState(Date.now),
    [saved, setSaved] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const api = (step, extra = {}) =>
    personalApi(`/account/${kind}/${step}`, 'POST', {
      requestId: pending?.requestId,
      grant: proof,
      ...extra,
    });
  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e.message || '요청하지 못했어요. 다시 시도해주세요.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    await run(async () => {
      if (saved) {
        const { error } = await supabase.auth.refreshSession();
        if (error)
          throw Error('변경은 저장됐지만 계정 표시를 갱신하지 못했어요. 다시 확인해주세요.');
        setDone(true);
        return;
      }
      if (!pending) {
        setPending(await api('start'));
        setToken('');
        return;
      }
      if (pending.resumable) {
        await api('resume');
        setSaved(true);
        const { error } = await supabase.auth.refreshSession();
        if (error)
          throw Error('변경은 저장됐지만 계정 표시를 갱신하지 못했어요. 다시 확인해주세요.');
        setDone(true);
        return;
      }
      if (!proof) {
        if (!/^\d{6}$/.test(token)) throw Error('6자리 숫자 인증번호를 입력해주세요.');
        const value = await api('verify', { token });
        setProof(value.grant);
        setPending({ ...pending, expiresAt: value.expiresAt });
        setToken('');
        return;
      }
      const value = newValue.trim().toLowerCase();
      if (kind === 'username' && !rules.usernamePattern.test(value))
        throw Error('아이디는 소문자로 시작하는 영문·숫자 8~15자로 입력해주세요.');
      if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw Error('올바른 새 이메일을 입력해주세요.');
      if (kind === 'email' && !newSent) {
        setPending(await api('prepare', { newValue: value }));
        setNewSent(true);
        setToken('');
        return;
      }
      if (kind === 'email' && !/^\d{6}$/.test(token))
        throw Error('6자리 숫자 인증번호를 입력해주세요.');
      await api('complete', { newValue: value, token });
      setSaved(true);
      setProof('');
      setToken('');
      const { error } = await supabase.auth.refreshSession();
      if (error) throw Error('변경은 저장됐지만 계정 표시를 갱신하지 못했어요. 다시 확인해주세요.');
      setDone(true);
    });
  }
  const remaining = pending ? Math.max(0, Math.ceil((pending.expiresAt - clock) / 1000)) : 0;
  const wait = pending ? Math.max(0, Math.ceil((pending.resendAt - clock) / 1000)) : 0;
  return (
    <main className="signup-page mx-auto max-w-[480px]">
      <section className="signup-card">
        <Link to="/settings?view=account" className="signup-description">
          ‹ 계정 설정으로 돌아가기
        </Link>
        <h1 className="signup-title">{label} 변경</h1>
        <p className="signup-description">
          현재 등록 이메일을 먼저 인증해요.{kind === 'email' && ' 새 이메일도 인증한 뒤 변경해요.'}{' '}
          프로필·찜·신청 기록은 유지돼요.
        </p>
        {done ? (
          <>
            <p role="status">
              {label}
              {kind === 'username' ? '가' : '이'} 변경됐어요.
            </p>
            <Link to="/settings?view=account" className="signup-primary-button">
              계정 설정으로
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="signup-label">
              현재 아이디
              <input
                className="signup-input"
                value={user?.app_metadata?.registration?.username || '별도 아이디 없음'}
                disabled
              />
            </label>
            <label className="signup-label">
              등록 이메일
              <input className="signup-input" value={user?.email || ''} disabled />
            </label>
            {pending && !pending.resumable && (
              <p className="signup-description">
                {newSent ? '새 이메일' : '등록 이메일'}로 인증번호를 보냈어요. 남은 시간 {remaining}
                초
              </p>
            )}
            {proof && (
              <label className="signup-label">
                새 {label}
                <input
                  className="signup-input"
                  aria-label={`새 ${label}`}
                  type={kind === 'email' ? 'email' : 'text'}
                  value={newValue}
                  disabled={busy || newSent || saved}
                  autoComplete="off"
                  onChange={(e) => setNewValue(e.target.value.toLowerCase())}
                />
              </label>
            )}
            {pending && !pending.resumable && (!proof || newSent) && !saved && (
              <label className="signup-label">
                {newSent ? '새 이메일 인증번호' : '인증번호'}
                <input
                  className="signup-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={token}
                  disabled={busy}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                />
              </label>
            )}
            {message && (
              <p role="alert" className="signup-error">
                {message}
              </p>
            )}
            <button type="submit" className="signup-primary-button" disabled={busy}>
              {busy
                ? '처리 중…'
                : saved
                  ? '변경 결과 다시 확인'
                  : pending?.resumable
                    ? '저장 결과 확인'
                    : !pending
                      ? '인증번호 받기'
                      : !proof
                        ? '인증번호 확인'
                        : kind === 'email' && !newSent
                          ? '새 이메일 인증번호 받기'
                          : `${label} 변경 저장`}
            </button>
            {pending && !pending.resumable && (!proof || newSent) && !saved && (
              <button
                type="button"
                className="signup-secondary-button"
                disabled={busy || wait > 0}
                onClick={() =>
                  run(async () => {
                    setPending(await api('resend'));
                    setToken('');
                  })
                }
              >
                {wait > 0 ? `${wait}초 후 재발송` : '인증번호 재발송'}
              </button>
            )}
            {pending && !saved && (
              <button
                type="button"
                className="signup-secondary-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('cancel');
                    setPending(null);
                    setProof('');
                    setToken('');
                    setNewSent(false);
                    setNewValue('');
                  })
                }
              >
                변경 취소하고 다시 시작
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
