import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { initializeFederation } from './federation';

console.log('[Host] Starting application...');

initializeFederation().then(() => {
  console.log('[Host] Federation ready, rendering app...');

  ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
