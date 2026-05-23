import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the app lives at https://<user>.github.io/<repo>/, so we need
// a base path matching the repo name. In local dev (npm run dev) we want '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Home-Automation/' : '/',
  plugins: [react()],
  server: { port: 5173 },
}));
