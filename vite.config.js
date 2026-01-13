import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // En développement, utiliser '/' pour éviter les problèmes de chargement
  // En production (build), utiliser '/Rendu-3-AICG/' pour GitHub Pages
  base: mode === 'production' ? '/Rendu-3-AICG/' : '/',
  plugins: [react()],
  server: {
    host: 'localhost',
    strictPort: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  }
}));
