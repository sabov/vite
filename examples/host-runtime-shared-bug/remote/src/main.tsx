import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[Remote] Starting standalone application...');

const root = ReactDOM.createRoot(document.getElementById('app')!);
root.render(
  <React.StrictMode>
    <h1>Remote Standalone Mode</h1>
    <p>This is the remote running standalone (not loaded via federation).</p>
    <p style={{ color: '#e94560' }}>
      Note: When running standalone, @my-org/shared-module won't be available because it's provided
      by the host at runtime.
    </p>
    <hr />
    <App />
  </React.StrictMode>
);
