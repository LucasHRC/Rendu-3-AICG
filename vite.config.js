import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Rendu-3-AICG/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
    open: true,
  },
});

