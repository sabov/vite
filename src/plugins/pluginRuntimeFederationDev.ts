import { Plugin, ViteDevServer } from 'vite';

interface RemoteConfig {
  name: string;
  entry: string;
}

export interface RuntimeFederationDevOptions {
  remotes: RemoteConfig[];
}

interface RemoteDevInfo {
  name: string;
  httpBase: string;
  wsBase: string;
}

/**
 * Standalone Vite plugin for runtime module federation HMR.
 *
 * This plugin is designed for host applications that use @module-federation/runtime
 * directly (without the full federation() Vite plugin). It:
 * 1. Connects server-side to each remote's Vite HMR WebSocket
 * 2. Listens for 'mf:remote-changed' custom events from the remote
 * 3. Forwards them to the host's HMR client as 'mf:remote-update' events
 *
 * Usage:
 *   import { runtimeFederationDev } from '@module-federation/vite';
 *
 *   export default defineConfig({
 *     plugins: [
 *       react(),
 *       runtimeFederationDev({
 *         remotes: [
 *           { name: '@namespace/remote', entry: 'http://localhost:5176/base' }
 *         ]
 *       })
 *     ]
 *   })
 */
export function runtimeFederationDev(options: RuntimeFederationDevOptions): Plugin {
  let server: ViteDevServer;

  return {
    name: 'module-federation-runtime-dev-hmr',
    apply: 'serve',

    configureServer(_server) {
      server = _server;

      _server.httpServer?.once('listening', () => {
        connectToRemotes();
      });
    },
  };

  function getRemoteInfos(): RemoteDevInfo[] {
    const remoteInfos: RemoteDevInfo[] = [];
    for (const remote of options.remotes) {
      try {
        const url = new URL(remote.entry);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        // Strip the filename from the path (e.g., /testbase/mf-manifest.json -> /testbase)
        const pathBase =
          url.pathname.replace(/\/[^/]*\.[^/]*$/, '') || url.pathname.replace(/\/[^/]*$/, '');
        remoteInfos.push({
          name: remote.name,
          httpBase: `${url.protocol}//${url.host}${pathBase}`,
          wsBase: `${wsProtocol}//${url.host}${pathBase}`,
        });
      } catch {
        // Skip remotes with non-URL entries
      }
    }
    return remoteInfos;
  }

  async function fetchWsToken(httpBase: string): Promise<string> {
    const res = await fetch(httpBase + '/@vite/client');
    const code = await res.text();
    const tokenMatch = code.match(/wsToken\s*=\s*"([^"]*)"/);
    return tokenMatch ? tokenMatch[1] : '';
  }

  function connectToRemotes() {
    const remoteInfos = getRemoteInfos();
    for (const remote of remoteInfos) {
      connectToRemote(remote);
    }
  }

  async function connectToRemote(remote: RemoteDevInfo) {
    try {
      const token = await fetchWsToken(remote.httpBase);
      const wsUrl = `${remote.wsBase}/?token=${encodeURIComponent(token)}`;
      openWebSocket(remote, wsUrl);
    } catch {
      setTimeout(() => connectToRemote(remote), 5000);
    }
  }

  function openWebSocket(remote: RemoteDevInfo, wsUrl: string) {
    const WebSocket = globalThis.WebSocket ?? (require('ws') as typeof globalThis.WebSocket);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, 'vite-hmr');
    } catch {
      setTimeout(() => connectToRemote(remote), 5000);
      return;
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));

        // Listen for the custom event sent by pluginExposeHMR on the remote
        if (data.type === 'custom' && data.event === 'mf:remote-changed') {
          forwardRemoteUpdate(remote);
          return;
        }

        // Also handle legacy full-reload and update events from remotes
        // that haven't adopted pluginExposeHMR yet
        if (data.type === 'update' || data.type === 'full-reload') {
          forwardRemoteUpdate(remote);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setTimeout(() => connectToRemote(remote), 2000);
    };

    ws.onerror = () => {
      // Will trigger onclose, which handles reconnection
    };
  }

  function forwardRemoteUpdate(remote: RemoteDevInfo) {
    if (!server) return;

    // Forward the event to host HMR clients
    server.hot.send({
      type: 'custom',
      event: 'mf:remote-update',
      data: { remote: remote.name },
    });
  }
}
