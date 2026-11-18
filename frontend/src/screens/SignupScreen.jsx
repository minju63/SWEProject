import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, Mail, UserRound, LockKeyhole, Eye, EyeOff, MailCheck } from 'lucide-react'
import { supabase, useAuth } from '../lib/auth'
import './SignupScreen.css'
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
const redirectTo = () => `${window.location.origin}/auth/confirm`
function authError(error) {
  const { code, status } = error ?? {}
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit')
    return '요청이 많아요. 잠시 후 다시 시도해주세요.'
  if (code === 'signup_disabled')
    return '현재 회원가입을 받을 수 없어요. 잠시 후 다시 시도해주세요.'
  if (code === 'weak_password') return '비밀번호가 안전하지 않아요. 다른 비밀번호를 사용해주세요.'
  if (code === 'user_already_exists' || code === 'email_exists')
    return '이미 가입한 이메일이라면 로그인해주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
}
export default function SignupScreen() {
  const navigate = useNavigate()
  const { user, ready, requestLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [messages, setMessages] = useState({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState('')
  useEffect(() => {
    if (user) navigate('/my', { replace: true })
  }, [user?.id, navigate])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  const clear = (field) =>
    setMessages((value) => ({ ...value, [field]: undefined, form: undefined }))
  const login = () => {
    navigate('/my')
    requestLogin()
  }
  const fieldMessage = (field) =>
    messages[field] && (
      <p id={`signup-${field}-error`} role="alert" className="signup-field-message message-error">
        {messages[field]}
      </p>
    )
  async function submit(event) {
    event.preventDefault()
    if (busy || !ready) return
    const errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = '올바른 이메일을 입력해주세요.'
    if (!nickname.trim() || nickname.trim().length > 20)
      errors.nickname = '닉네임은 1~20자로 입력해주세요.'
    if (!passwordPattern.test(password))
      errors.password = '영문 대·소문자, 숫자, 특수문자를 포함해 8자 이상 입력해주세요.'
    if (password !== confirmation) errors.confirmation = '비밀번호가 서로 다릅니다.'
    setMessages(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: nickname.trim() }, emailRedirectTo: redirectTo() },
      })
      if (error) throw error
      setPassword('')
      setConfirmation('')
      if (data.session) navigate('/my', { replace: true })
      else {
        setEmail(email.trim())
        setSent(true)
        setCooldown(60)
      }
    } catch (error) {
      setMessages({ form: authError(error) })
    } finally {
      setBusy(false)
    }
  }
  async function resend() {
    if (busy || cooldown) return
    setBusy(true)
    setMessages({})
    setResendNotice('')
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectTo() },
      })
      if (error) throw error
      setResendNotice('인증 메일을 다시 요청했어요. 받은 편지함을 확인해주세요.')
      setCooldown(60)
    } catch (error) {
      setMessages({ form: authError(error) })
      setCooldown(60)
    } finally {
      setBusy(false)
    }
  }
  if (user) return null
  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <main className="signup-page mx-auto max-w-[480px]" aria-labelledby="signup-title">
        <section className="signup-card">
          <button
            type="button"
            className="signup-back-button"
            onClick={() => navigate('/my')}
            aria-label="마이 화면으로 돌아가기"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 id="signup-title" className="signup-title">
            회원가입
          </h1>
          {sent ? (
            <div className="signup-confirmation">
              <span className="signup-mail-icon">
                <MailCheck size={32} />
              </span>
              <h2>이메일 인증을 확인해주세요</h2>
              <p>
                <strong>{email}</strong>로 온 인증 안내를 확인해주세요. 메일의 링크를 누르면 가입을
                완료할 수 있어요.
              </p>
              <p>
                이미 가입한 이메일이라면 로그인해주세요. 메일이 보이지 않으면 스팸함도 확인해주세요.
              </p>
              {fieldMessage('form')}
              {resendNotice && <p role="status">{resendNotice}</p>}
              <button
                className="signup-submit-button"
                disabled={busy || cooldown > 0}
                onClick={resend}
              >
                {busy
                  ? '요청 중…'
                  : cooldown
                    ? `인증 메일 재전송 (${cooldown}초)`
                    : '인증 메일 재전송'}
              </button>
              <button
                className="signup-login-link"
                onClick={() => {
                  setSent(false)
                  setMessages({})
                  setResendNotice('')
                }}
              >
                다른 이메일로 가입하기
              </button>
            </div>
          ) : (
            <>
              <p className="signup-description">이메일과 닉네임을 입력하고 계정을 만들어보세요.</p>
              <form className="signup-form" onSubmit={submit} noValidate aria-busy={busy}>
                <fieldset disabled={busy || !ready} className="signup-fields">
                  <div className="signup-field-group">
                    <label htmlFor="signup-email" className="signup-label">
                      이메일
                    </label>
                    <div className="signup-password-wrapper">
                      <Mail className="signup-icon" size={16} />
                      <input
                        id="signup-email"
                        className="signup-input"
                        type="email"
                        autoComplete="email"
                        placeholder="이메일 입력"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          clear('email')
                        }}
                        aria-invalid={!!messages.email}
                        aria-describedby={messages.email ? 'signup-email-error' : undefined}
                        required
                      />
                    </div>
                    {fieldMessage('email')}
                  </div>
                  <div className="signup-field-group">
                    <label htmlFor="signup-nickname" className="signup-label">
                      닉네임
                    </label>
                    <div className="signup-password-wrapper">
                      <UserRound className="signup-icon" size={16} />
                      <input
                        id="signup-nickname"
                        className="signup-input"
                        autoComplete="nickname"
                        maxLength={20}
                        placeholder="닉네임 입력"
                        value={nickname}
                        onChange={(e) => {
                          setNickname(e.target.value)
                          clear('nickname')
                        }}
                        aria-invalid={!!messages.nickname}
                        aria-describedby={messages.nickname ? 'signup-nickname-error' : undefined}
                        required
                      />
                    </div>
                    {fieldMessage('nickname')}
                  </div>
                  {[
                    ['password', '비밀번호', password, setPassword, showPassword, setShowPassword],
                    [
                      'confirmation',
                      '비밀번호 확인',
                      confirmation,
                      setConfirmation,
                      showConfirmation,
                      setShowConfirmation,
                    ],
                  ].map(([field, label, value, setter, shown, toggle]) => (
                    <div className="signup-field-group" key={field}>
                      <label className="signup-label" htmlFor={`signup-${field}`}>
                        {label}
                      </label>
                      <div className="signup-password-wrapper">
                        <LockKeyhole className="signup-icon" size={16} />
                        <input
                          id={`signup-${field}`}
                          className="signup-input signup-secret"
                          type={shown ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder={field === 'password' ? '비밀번호 입력' : '비밀번호 재입력'}
                          value={value}
                          onChange={(e) => {
                            setter(e.target.value)
                            clear(field)
                          }}
                          aria-invalid={!!messages[field]}
                          aria-describedby={
                            messages[field] ? `signup-${field}-error` : 'signup-password-guide'
                          }
                          required
                        />
                        <button
                          type="button"
                          className="signup-password-toggle"
                          onClick={() => toggle(!shown)}
                          aria-label={`${label} ${shown ? '숨기기' : '표시하기'}`}
                        >
                          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      {fieldMessage(field)}
                    </div>
                  ))}
                  <p id="signup-password-guide" className="signup-password-guide">
                    8자 이상, 영문 대·소문자·숫자·특수문자(@$!%*?&) 포함.
                  </p>
                  <p className="signup-password-guide">
                    가입 후 이메일로 보내드리는 인증 링크를 확인해주세요.
                  </p>
                  {fieldMessage('form')}
                  <button type="submit" className="signup-submit-button">
                    {busy ? '가입 요청 중…' : '회원가입 완료하기'}
                  </button>
                </fieldset>
              </form>
            </>
          )}
          <div className="signup-login-row">
            <span>이미 계정이 있으신가요?</span>
            <button type="button" className="signup-login-link" onClick={login} disabled={busy}>
              로그인
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
