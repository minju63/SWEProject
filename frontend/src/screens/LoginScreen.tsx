import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
export default function LoginScreen() {
  const { user, ready, requestLogin } = useAuth(),
    navigate = useNavigate();
  useEffect(() => {
    if (user) navigate("/", { replace: true });
    else if (ready) requestLogin();
  }, [ready, user?.id]);
  return (
    <main className="min-h-screen bg-[#F3F6FB] flex items-center justify-center">
      <button
        onClick={requestLogin}
        className="rounded-xl bg-[#2F7BF5] px-8 py-3 font-bold text-white"
      >
        로그인하기
      </button>
    </main>
  );
}
