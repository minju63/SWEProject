import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// service_role 키: RLS를 우회하므로 서버에서만 사용한다.
// 사용자 데이터를 다룰 때는 반드시 req.user.id 로 user_id 조건을 직접 건다.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
