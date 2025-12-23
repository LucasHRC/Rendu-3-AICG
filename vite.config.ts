import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  // En développement, utiliser '/' pour éviter les problèmes de chargement
  // En production (build), utiliser '/Rendu-3-AICG/' pour GitHub Pages
  base: mode === 'production' ? '/Rendu-3-AICG/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost'
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  }
}));
