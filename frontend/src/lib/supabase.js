import { createClient } from '@supabase/supabase-js';

// 로그인 전용 (anon 키). 데이터 조회·저장은 Express API를 거친다.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
