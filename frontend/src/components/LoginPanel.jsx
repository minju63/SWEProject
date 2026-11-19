import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ChevronLeft } from 'lucide-react';
import './LoginPanel.css';
export default function LoginPanel({
  email,
  password,
  setEmail,
  setPassword,
  onSubmit,
  onClose,
  error,
  busy,
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  function keyDown(e) {
    if (e.key === 'Escape' && !busy) onClose();
    if (e.key === 'Tab') {
      const items = ref.current?.querySelectorAll('button:not(:disabled), input, a[href]');
      if (!items?.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div className="login-backdrop">
      <div
        ref={ref}
        tabIndex={-1}
        onKeyDown={keyDown}
        className="login-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <button
          className="login-close"
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="닫기"
        >
          <ChevronLeft size={20} />
        </button>
        <header className="login-brand">
          <div className="login-mascot">
            <img src="/assets/cheonghae-shark.png" alt="청해 상어 캐릭터" />
          </div>
          <h1 id="login-title">청해</h1>
          <p>부산 청년 AI 생활·혜택 안내</p>
        </header>
        <form className="login-form" onSubmit={onSubmit}>
          <label htmlFor="login-email">아이디</label>
          <input
            id="login-email"
            aria-label="아이디 또는 이메일"
            type="text"
            autoComplete="username"
            placeholder="아이디 또는 이메일 입력"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            required
            disabled={busy}
          />
          <label htmlFor="login-password" className="login-password-label">
            비밀번호
          </label>
          <div className="login-password-wrap">
            <input
              id="login-password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
            <button
              type="button"
              aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
              aria-pressed={visible}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setVisible(true);
              }}
              onPointerUp={() => setVisible(false)}
              onPointerCancel={() => setVisible(false)}
              onPointerLeave={() => setVisible(false)}
              onBlur={() => setVisible(false)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setVisible(true);
                }
              }}
              onKeyUp={() => setVisible(false)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
          <div className="login-find">
            <a href="/find-username" onClick={onClose}>
              아이디 찾기
            </a>
            <span aria-hidden="true">|</span>
            <a href="/reset-password" onClick={onClose}>
              비밀번호 찾기
            </a>
          </div>
        </form>
        <footer className="login-footer">
          아직 회원이 아니신가요?{' '}
          <a href="/signup" onClick={onClose}>
            회원가입
          </a>
        </footer>
        <div className="login-home-indicator" aria-hidden="true" />
      </div>
    </div>
  );
}
