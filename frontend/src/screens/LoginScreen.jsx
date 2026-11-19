import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
export default function LoginScreen() {
  const { user, ready, requestLogin } = useAuth(),
    navigate = useNavigate();
  const loggedIn = !!user;
  const pending = !!user?.app_metadata?.registration_pending;
  const [params] = useSearchParams();
  const deletion = params.get('deletion');
  const passwordChanged = params.get('password') === 'changed';
  useEffect(() => {
    if (loggedIn) navigate(pending ? '/signup' : '/', { replace: true });
    else if (ready && !deletion && !passwordChanged) requestLogin();
  }, [ready, loggedIn, pending, deletion, passwordChanged, navigate, requestLogin]);
  return (
    <main className="min-h-screen bg-[#F3F6FB] flex flex-col gap-6 items-center justify-center px-6">
      {passwordChanged && <p role="status">비밀번호가 변경됐어요. 다시 로그인해주세요.</p>}
      {deletion && (
        <p role="status" className="text-center text-sm text-slate-700">
          {deletion === 'pending'
            ? '탈퇴 요청이 접수됐어요. 삭제 처리가 지연되고 있어요. 관리자에게 문의해주세요.'
            : '탈퇴가 완료됐어요.'}
        </p>
      )}
      <button
        onClick={requestLogin}
        className="rounded-xl bg-[#2F7BF5] px-8 py-3 font-bold text-white"
      >
        로그인하기
      </button>
    </main>
  );
}
