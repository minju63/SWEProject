import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', port: 5173, fs:{allow:[searchForWorkspaceRoot(import.meta.dirname),path.resolve(import.meta.dirname,'../shared')]}, proxy: { '/api': 'http://127.0.0.1:4000' } },
})
