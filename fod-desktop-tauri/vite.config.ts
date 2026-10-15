import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import svgr from 'vite-plugin-svgr';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    svgr(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/image': path.resolve(__dirname, './src/mocks/next-image.tsx'),
      'next/image.js': path.resolve(__dirname, './src/mocks/next-image.tsx'),
      'next/dynamic': path.resolve(__dirname, './src/mocks/next-dynamic.tsx'),
    },
  },
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    cors: true,
    hmr: {
      host: '127.0.0.1',
      port: 5174,
    },
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/backend-rs/**',
      ],
    },
  },
  // Pre-bundle all major dependencies to prevent on-the-fly bundling restarts
  // that cause WebKitGTK to drop connections and trigger internal loader errors.
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'react-redux',
      '@reduxjs/toolkit',
      'redux-persist',
      'framer-motion',
      'react-toastify',
      'mapbox-gl',
      'react-icons/bs',
      'react-icons/gi',
      'react-icons/hi',
      'react-icons/im',
      'react-icons/md',
      'react-icons/pi',
      'react-icons/rx',
      'vite-plugin-node-polyfills/shims/process',
      'vite-plugin-node-polyfills/shims/buffer',
    ],
  },
  // Base is '/' in dev server to avoid path resolution errors, and './' in production builds for Tauri webview.
  base: mode === 'production' ? './' : '/',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
}));
