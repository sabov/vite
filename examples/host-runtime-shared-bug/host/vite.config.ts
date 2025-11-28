import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// NOTE: Host does NOT use the federation plugin!
// It uses the runtime API directly to demonstrate the bug
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    open: true,
    hmr: false,
  },
  preview: {
    port: 5000,
  },
  build: {
    target: 'chrome89',
  },
});
