import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const mfRemoteFullReloadPlugin = {
  name: 'mf-remote-full-reload',
  apply: 'serve',
  handleHotUpdate({ server, file }) {
    if (file.includes('/src/')) {
      console.log(`[mf-remote] Source changed: ${file}, sending full-reload`);
      server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    }
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: false,
    port: 5176,
    origin: 'http://localhost:5176',
  },
  preview: {
    port: 5176,
  },
  base: 'http://localhost:5176/testbase',
  plugins: [
    react({ jsxImportSource: '@emotion/react' }),
    federation({
      name: '@namespace/viteViteRemote',
      exposes: {
        './App1': './src/App1',
        './App2': './src/App2.jsx',
        './AgGridDemo': './src/AgGridDemo.jsx',
        './MuiDemo': './src/MuiDemo.jsx',
        './StyledDemo': './src/StyledDemo.jsx',
        './EmotionDemo': './src/EmotionDemo.jsx',
        './App': './src/App.jsx',
      },
      filename: 'remoteEntry-[hash].js',
      manifest: true,
      shared: {
        'react/': {},
        react: { requiredVersion: '18' },
        'react-dom/': {},
        'react-dom': {},
        'styled-components': { singleton: true },
        'ag-grid-community/': {},
        'ag-grid-react': {},
        '@emotion/react': {},
        '@emotion/styled': { singleton: true },
        '@mui/material': {},
      },
    }),
    mfRemoteFullReloadPlugin,
  ],
  build: {
    target: 'chrome89',
    rollupOptions: {
      output: {
        chunkFileNames: 'static/js/[name]-[hash].js',
        entryFileNames: 'static/js/[name]-[hash].js',
        assetFileNames: 'static/[ext]/[name]-[hash].[ext]',
      },
    },
  },
});
