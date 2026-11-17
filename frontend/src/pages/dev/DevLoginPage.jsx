import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import './DevLoginPage.css';

export default function DevLoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) {
        setErrorMessage('로그인에 실패했습니다. 테스트 계정 정보를 확인해 주세요.');
        return;
      }
      setPassword('');
      queryClient.clear();
      navigate('/search', { replace: true });
    } catch {
      setErrorMessage('로그인 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
      setPassword('');
    } catch {
      setErrorMessage('로그아웃에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="dev-login">
      <h1>개발용 테스트 로그인</h1>
      <p>Supabase Auth에 등록된 테스트 계정으로 로그인하세요.</p>
      {user ? (
        <div className="dev-login__actions">
          <p>로그인됨: {user.email ?? user.id}</p>
          <Link className="dev-login__primary" to="/search">정책 검색으로 이동</Link>
          <button type="button" onClick={handleLogout} disabled={submitting}>로그아웃</button>
        </div>
      ) : (
        <form onSubmit={handleLogin}>
          <label htmlFor="dev-login-email">이메일</label>
          <input id="dev-login-email" type="email" value={email}
            onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
          <label htmlFor="dev-login-password">비밀번호</label>
          <input id="dev-login-password" type="password" value={password}
            onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          <button className="dev-login__primary" type="submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      )}
      {errorMessage && <p className="dev-login__error" role="alert">{errorMessage}</p>}
    </section>
  );
}
