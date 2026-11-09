import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAuthStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// 앱 시작 시 로그인 상태를 불러오고, 바뀔 때마다 갱신한다
supabase.auth
  .getSession()
  .then(({ data }) => useAuthStore.getState().setUser(data.session?.user ?? null));
supabase.auth.onAuthStateChange((_event, session) =>
  useAuthStore.getState().setUser(session?.user ?? null)
);
