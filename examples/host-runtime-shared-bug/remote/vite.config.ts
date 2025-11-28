import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Remote uses the federation plugin (unlike the host)
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'remote',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^18.0.0',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.0.0',
        },
        '@my-org/shared-module': {
          singleton: true,
          version: '1.0.0',
        },
      },
      manifest: {
        fileName: 'mf-manifest.json',
        disableAssetsAnalyze: false,
      },
    }),
  ],
  server: {
    port: 5001,
    origin: 'http://localhost:5001',
    hmr: false,
  },
  preview: {
    port: 5001,
  },
  build: {
    target: 'chrome89',
  },
});
