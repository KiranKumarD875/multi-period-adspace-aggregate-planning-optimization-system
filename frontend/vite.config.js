import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api is proxied to the FastAPI server. A production build is
// served by FastAPI itself from frontend/dist, so no proxy is needed there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': { target: 'http://127.0.0.1:8010', changeOrigin: true } },
  },
});
