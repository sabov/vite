import React from 'react';
import { createRemoteApp } from './createRemoteApp';
import { mfInstance } from './federation';

const RemoteApp = createRemoteApp({
  instance: mfInstance,
  remoteName: '@namespace/viteViteRemote',
  moduleName: 'App',
});

const App1 = createRemoteApp({
  instance: mfInstance,
  remoteName: '@namespace/viteViteRemote',
  moduleName: 'App1',
});

const App2 = createRemoteApp({
  instance: mfInstance,
  remoteName: '@namespace/viteViteRemote',
  moduleName: 'App2',
  exportName: 'App2',
});

export default function HostApp() {
  return (
    <div style={{ background: 'lightgray' }}>
      <p>
        Vite React (v {React.version}) app running from Host in{' '}
        <i>{import.meta.env.DEV ? ' Dev ' : ' prod '} mode</i>
      </p>
      <hr />

      <h2>Remote Default App!</h2>
      <RemoteApp />

      <h2>Vite Remote App1</h2>
      <App1 />

      <h2>Vite Remote App2</h2>
      <App2 />

      <hr />
    </div>
  );
}
