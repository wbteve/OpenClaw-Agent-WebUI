import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.FRONTEND_PORT) || 8899,
    host: true,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8898}`,
        changeOrigin: true,
      },
      '/uploads': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8898}`,
        changeOrigin: true,
      },
      '/openclaw': {
        target: `http://localhost:${process.env.BACKEND_PORT || 8898}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});