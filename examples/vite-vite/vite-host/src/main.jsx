import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeFederation } from './federation';
import './style.css';

initializeFederation().then(() => {
  import('./App').then(({ default: App }) => {
    const root = ReactDOM.createRoot(document.getElementById('app'));
    root.render(
      <React.StrictMode>
        <h1>MF HOST Demo</h1>
        <App />
      </React.StrictMode>
    );
  });
});
