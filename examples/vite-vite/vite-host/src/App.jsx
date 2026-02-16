import React from 'react';

import RemoteApp from '@namespace/viteViteRemote';
import App1 from '@namespace/viteViteRemote/App1';
import { App2 } from '@namespace/viteViteRemote/App2';

export default function HostApp() {
  return (
    <div style={{ background: 'lightgray' }}>
      <p>
        Vite React (v {React.version}) app running from Host in{' '}
        <i> {import.meta.env.DEV ? ' Dev ' : ' prod '} mode </i>
      </p>
      <hr />

      <h2>Vite Remote Default App!!</h2>
      <RemoteApp />

      <h2>Vite Remote App1</h2>
      <App1 />

      <h2>Vite Remote App2</h2>
      <App2 />

      <hr />
    </div>
  );
}
