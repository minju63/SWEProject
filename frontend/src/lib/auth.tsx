import { createClient, type User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import LoginPanel from "../components/LoginPanel";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key || key.startsWith("sb_secret_"))
  throw new Error("브라우저용 Supabase 설정을 확인해 주세요.");
export const supabase = createClient(url, key);
const Context = createContext<{
  user: User | null;
  ready: boolean;
  requestLogin: () => void;
  signOut: () => Promise<void>;
}>({
  user: null,
  ready: false,
  requestLogin: () => {},
  signOut: async () => {},
});
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
        setUser(session?.user ?? null);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const credentials = { email: email.trim(), password };
    setPassword("");
    try {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setOpen(false);
      setPassword("");
    } catch {
      setError("로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        ready,
        requestLogin: () => {
          setError("");
          setOpen(true);
        },
        signOut: async () => {
          const { error } = await supabase.auth.signOut();
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
              setPassword("");
            }
          }}
          error={error}
          busy={busy}
        />
      )}
    </Context.Provider>
  );
}
