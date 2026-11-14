import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
// tailwindcss: 지도 탭 전용. pages/map/map.css 에서만 불러오고, 그 폴더의 클래스만 생성한다(다른 화면 영향 없음).
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
