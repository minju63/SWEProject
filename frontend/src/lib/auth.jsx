import { createClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import LoginPanel from '../components/LoginPanel';
import { signupApi } from './signup.js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key || key.startsWith('sb_secret_'))
  throw new Error('브라우저용 Supabase 설정을 확인해 주세요.');
export const supabase = createClient(url, key);
const Context = createContext({
  user: null,
  ready: false,
  requestLogin: () => {},
  signOut: async () => {},
});
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const previousAccount = useRef(null);
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const requestLogin = useCallback(() => {
    setError('');
    setOpen(true);
  }, []);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setUser(error ? null : (data.session?.user ?? null));
          setReady(true);
        }
      })
      .catch(() => active && setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        const nextAccount = session?.user?.id ?? null;
        if (previousAccount.current !== nextAccount) {
          queryClient.clear();
          previousAccount.current = nextAccount;
        }
        setUser(session?.user ?? null);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const credentials = { email: email.trim(), password };
    setPassword('');
    try {
      // Keep existing email accounts on their established sign-in path.
      const result = credentials.email.includes('@')
        ? await supabase.auth.signInWithPassword(credentials)
        : await signupApi('/login', {
            identifier: credentials.email,
            password: credentials.password,
          });
      const { error } = credentials.email.includes('@')
        ? result
        : await supabase.auth.setSession(result);
      if (error) throw error;
      setOpen(false);
      setPassword('');
    } catch {
      setError('아이디 또는 비밀번호를 확인해 주세요');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        ready,
        requestLogin,
        signOut: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) await signupApi('/logout', {}, session.access_token);
          const { error } = await supabase.auth.signOut({ scope: 'local' });
          if (error) throw error;
        },
      }}
    >
      {children}
      {open && (
        <LoginPanel
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          onSubmit={login}
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setPassword('');
            }
          }}
          error={error}
          busy={busy}
        />
      )}
    </Context.Provider>
  );
}
