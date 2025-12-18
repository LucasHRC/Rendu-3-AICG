import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Rendu-3-AICG/',
  server: {
    port: 5173,
    host: 'localhost'
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
