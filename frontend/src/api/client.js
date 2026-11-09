import axios from 'axios';
import { supabase } from '../lib/supabase';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// 로그인 상태면 Supabase 토큰을 Authorization 헤더에 붙인다
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 응답 형식 { success, data, message } 에서 data만 꺼낸다
api.interceptors.response.use(
  (res) => res.data.data,
  (err) => Promise.reject(new Error(err.response?.data?.message ?? err.message))
);
