import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('app')!);
root.render(
  <React.StrictMode>
    <h1>Remote Standalone Mode</h1>
    <hr />
    <App />
  </React.StrictMode>
);
