# Replicating the UIPR Module Federation Demo Setup in `vite-vite`

This document explains how to update the `examples/vite-vite` example in the `@module-federation/vite` repo to replicate the architecture used by the [UIPR Module Federation Demo](https://github.netflix.net/corp/uipr-module-federation-demo).

## Architecture Overview: Key Differences

The UIPR demo uses a fundamentally different architecture from the current `vite-vite` example:

| Aspect                    | Current `vite-vite`                                                             | UIPR Demo                                                                           |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Host federation**       | Build-time (via `federation()` plugin)                                          | Runtime-only (via `@module-federation/enhanced/runtime`)                            |
| **Remote resolution**     | Static `import` statements resolved at build time through proxy virtual modules | Dynamic `loadRemote()` calls at runtime                                             |
| **Remote config in host** | Declared in `vite.config.js` `remotes: {}`                                      | No `federation()` plugin on host at all                                             |
| **Remote entry loading**  | Build-time aliasing + proxy modules                                             | `createInstance()` with `entry` URLs at runtime                                     |
| **Shared dependencies**   | Declared in both host and remote `vite.config`                                  | Host: provided via `lib: () => React` at runtime; Remote: declared in `vite.config` |
| **SSR / React Router**    | None (pure SPA)                                                                 | React Router v7 with SSR hydration                                                  |
| **Remote standalone**     | Has its own `index.html` + `main.jsx`                                           | Remote is a "headless" component, no standalone page                                |
| **HMR strategy**          | `pluginRemoteDevHMR` invalidates proxy virtual modules                          | Remote-side `full-reload` plugin (host HMR channel is broken in React Router setup) |

## Step-by-Step Changes

### 1. Restructure the Host: Remove `federation()` from Vite Config

The UIPR host does **not** use the `federation()` Vite plugin at all. The host's `vite.config` should only contain standard Vite configuration (React plugin, server settings, etc.).

**Current `vite-host/vite.config.js`** uses `federation()` to declare remotes at build time.

**Target `vite-host/vite.config.js`:**

```js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: false,
    port: 5175,
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'chrome89',
  },
});
```

Key changes:

- Remove `federation()` plugin entirely
- Remove `vite-plugin-top-level-await`
- Remove `runtimePlugins`
- Keep `@vitejs/plugin-react`
- Add `resolve.dedupe` for shared singletons

### 2. Add Runtime Federation Initialization in the Host

Create a new file that initializes Module Federation at runtime using `@module-federation/enhanced/runtime`:

**New file: `vite-host/src/federation.js`**

```js
import { createInstance } from '@module-federation/enhanced/runtime';
import React from 'react';
import ReactDOM from 'react-dom';

let mfInstance = null;

const REMOTES = [
  {
    name: '@namespace/viteViteRemote',
    entry: 'http://localhost:5176/testbase/mf-manifest.json',
  },
];

export const initializeFederation = async () => {
  if (!mfInstance) {
    mfInstance = await createInstance({
      name: 'viteViteHost',
      remotes: REMOTES.map((remote) => ({
        name: remote.name,
        type: 'module',
        entry: remote.entry,
        shareScope: 'default',
      })),
      shared: {
        react: {
          version: '18.3.1',
          scope: 'default',
          lib: () => React,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18',
          },
        },
        'react-dom': {
          version: '18.3.1',
          scope: 'default',
          lib: () => ReactDOM,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18',
          },
        },
      },
    });
  }
};

export { mfInstance };
```

Key points:

- `lib: () => React` eagerly provides the shared library instead of relying on build-time shared module proxying
- `type: 'module'` tells the runtime to load the remote entry as an ES module
- The `entry` URL points to the remote's manifest (or `remoteEntry.js`)

### 3. Update Host Entry Point to Initialize Before Rendering

The host must call `initializeFederation()` **before** rendering the React tree, since `loadRemote()` needs the runtime instance to be ready.

**Updated `vite-host/src/main.jsx`:**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeFederation } from './federation';

initializeFederation().then(() => {
  // Dynamic import to ensure federation is ready before App loads
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
```

### 4. Create a `createRemoteApp` Helper

Instead of static imports like `import App1 from '@namespace/viteViteRemote/App1'`, the UIPR pattern uses a lazy-loading wrapper around `loadRemote()`:

**New file: `vite-host/src/createRemoteApp.jsx`**

```jsx
import React, { Suspense, lazy } from 'react';

export function createRemoteApp({ instance, remoteName, moduleName }) {
  const RemoteCmp = lazy(async () => {
    const mod = await instance.loadRemote(`${remoteName}/${moduleName}`);
    if (!mod?.default) {
      return {
        default: () => (
          <div>
            Error: Missing default export for {remoteName}/{moduleName}
          </div>
        ),
      };
    }
    return { default: mod.default };
  });

  const RemoteApp = (props) => (
    <Suspense fallback={<div>Loading {moduleName}...</div>}>
      <RemoteCmp {...props} />
    </Suspense>
  );

  RemoteApp.displayName = `RemoteApp(${remoteName}/${moduleName})`;
  return RemoteApp;
}
```

### 5. Update Host App Component to Use Runtime Loading

**Updated `vite-host/src/App.jsx`:**

```jsx
import React from 'react';
import { createRemoteApp } from './createRemoteApp';
import { mfInstance } from './federation';

const RemoteApp = createRemoteApp({
  instance: mfInstance,
  remoteName: '@namespace/viteViteRemote',
  moduleName: '.',
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
```

Key change: **No static imports from the remote.** Everything goes through `createRemoteApp()` → `loadRemote()`.

### 6. Update Host Dependencies

**Updated `vite-host/package.json` dependencies:**

```json
{
  "dependencies": {
    "@module-federation/enhanced": "workspace:*",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.2",
    "vite": "^7.1.7"
  }
}
```

Key changes:

- Replace `@module-federation/vite` with `@module-federation/enhanced` (only the runtime is needed)
- Remove all UI libraries that were only used in the remote (ag-grid, mui, emotion, styled-components, vue)
- Remove `vite-plugin-top-level-await`

### 7. Remote Stays Mostly the Same

The remote's `vite.config.js` remains largely unchanged — it still uses the `federation()` plugin to declare its exposed modules and build the `remoteEntry.js` + `mf-manifest.json`.

No changes needed to the remote's Vite config or source files.

### 8. Add HMR Support (Full-Reload Strategy)

With the host no longer using `federation()`, the `pluginRemoteDevHMR` plugin (which invalidates proxy virtual modules) has nothing to work with — there are no proxy modules in the host's module graph.

The UIPR demo works around this with a **remote-side full-reload plugin**. When the remote's source files change, the remote's Vite server sends a `full-reload` message to the browser via its own HMR WebSocket. This forces the entire page to reload, picking up the new remote code.

**Add to the remote's `vite.config.js`:**

```js
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

export default defineConfig({
  server: {
    open: false,
    port: 5176,
    origin: 'http://localhost:5176',
  },
  base: 'http://localhost:5176/testbase',
  plugins: [
    react({ jsxImportSource: '@emotion/react' }),
    federation({
      name: '@namespace/viteViteRemote',
      exposes: {
        './App1': './src/App1',
        './App2': './src/App2.jsx',
        '.': './src/App.jsx',
      },
      filename: 'remoteEntry-[hash].js',
      manifest: true,
      shared: {
        'react/': {},
        react: { requiredVersion: '18' },
        'react-dom/': {},
        'react-dom': {},
      },
    }),
    mfRemoteFullReloadPlugin,
  ],
  build: {
    target: 'chrome89',
  },
});
```

> **Note:** This is a full-reload, not incremental HMR. The browser will reload the entire page when a remote source file changes. True incremental HMR for runtime-only federation would require a more sophisticated approach (e.g., the host connecting to the remote's WebSocket and re-executing `loadRemote()` to get fresh modules).

### 9. Remove `mfPlugins.js`

Delete `vite-host/src/mfPlugins.js` — runtime plugins are no longer configured through the Vite plugin's `runtimePlugins` option. If you need runtime plugins, pass them directly to `createInstance()` in `federation.js`.

## Summary of File Changes

### Host (`vite-host/`)

| File                      | Action     | Description                                                          |
| ------------------------- | ---------- | -------------------------------------------------------------------- |
| `vite.config.js`          | **Modify** | Remove `federation()`, keep only React plugin + basic config         |
| `package.json`            | **Modify** | Replace `@module-federation/vite` with `@module-federation/enhanced` |
| `src/federation.js`       | **Create** | Runtime federation init with `createInstance()`                      |
| `src/createRemoteApp.jsx` | **Create** | Lazy wrapper using `loadRemote()`                                    |
| `src/main.jsx`            | **Modify** | Call `initializeFederation()` before render                          |
| `src/App.jsx`             | **Modify** | Use `createRemoteApp()` instead of static imports                    |
| `src/mfPlugins.js`        | **Delete** | No longer needed                                                     |

### Remote (`vite-remote/`)

| File             | Action     | Description                                |
| ---------------- | ---------- | ------------------------------------------ |
| `vite.config.js` | **Modify** | Add `mfRemoteFullReloadPlugin` for dev HMR |

## Why This Matters for `pluginRemoteDevHMR`

The current `pluginRemoteDevHMR` works by:

1. Connecting to remote HMR WebSockets from the host's Vite server
2. When a remote changes, invalidating `\0mf-proxy:` virtual modules in the host's module graph
3. Emitting synthetic `change` events for importer files to trigger Vite's HMR pipeline

**This approach fundamentally requires the host to use `federation()` at build time**, because it depends on:

- `MF_PROXY_PREFIX` virtual modules existing in the host's module graph
- The host having proxy modules that can be invalidated and re-transformed
- Vite's native HMR pipeline being able to trace from proxy modules to React components

In the UIPR/runtime-only setup, **none of these exist**. The host loads remotes dynamically via `loadRemote()` — there are no virtual modules, no proxy modules, and no build-time remote resolution.

To properly support HMR for this architecture, `@module-federation/vite` would need a new approach, such as:

- A host-side plugin that connects to remote WebSockets and triggers `full-reload` via the host's HMR channel
- Or a mechanism to re-execute `loadRemote()` and swap the component tree without a full page reload
- Or the remote-side full-reload plugin shown above as a pragmatic workaround
