import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { supabase, useAuth } from "../lib/auth"
import "./SignupScreen.css"

export default function AuthConfirmScreen() {
  const navigate = useNavigate()
  const { requestLogin } = useAuth()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    // The browser SDK processes the confirmation URL before getSession resolves.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (!error && data.session) navigate("/my", { replace: true })
      else setFailed(true)
    }).catch(() => active && setFailed(true))
    return () => { active = false }
  }, [navigate])
  return <main className="signup-page mx-auto max-w-[480px]">
    <h1 className="signup-title">이메일 인증</h1>
    {failed ? <>
      <p role="alert" className="signup-description">인증 링크가 만료되었거나 올바르지 않아요. 이미 인증했다면 로그인해주세요.</p>
      <button className="signup-submit-button" onClick={() => navigate("/signup", { replace: true })}>회원가입으로 돌아가기</button>
      <button className="signup-login-link" onClick={() => { navigate("/my"); requestLogin() }}>로그인</button>
    </> : <p role="status" className="signup-description">이메일 인증을 확인하고 있어요.</p>}
  </main>
}
