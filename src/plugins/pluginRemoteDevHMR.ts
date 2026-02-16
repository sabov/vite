import { Plugin, ViteDevServer } from 'vite';
import { NormalizedModuleFederationOptions } from '../utils/normalizeModuleFederationOptions';
import { MF_PROXY_PREFIX } from './pluginProxyRemotes';

interface RemoteDevInfo {
  name: string;
  httpBase: string;
  wsBase: string;
}

/**
 * Plugin to enable cross-app HMR for Module Federation in dev mode.
 *
 * When a remote's source files change, this plugin:
 * 1. Connects server-side to each remote's Vite HMR WebSocket
 * 2. Extracts the WS auth token from the remote's @vite/client
 * 3. When a remote sends an HMR update, invalidates the corresponding
 *    proxy virtual modules in the host's module graph
 * 4. Sends HMR update events to the host browser so React Fast Refresh
 *    can re-render only the affected components
 */
export function pluginRemoteDevHMR(options: NormalizedModuleFederationOptions): Plugin {
  const { remotes } = options;
  let server: ViteDevServer;

  return {
    name: 'module-federation-remote-dev-hmr',
    apply: 'serve',

    configureServer(_server) {
      server = _server;

      // Wait for the server to be ready, then connect to remote HMR servers
      _server.httpServer?.once('listening', () => {
        connectToRemotes();
      });
    },
  };

  function getRemoteInfos(): RemoteDevInfo[] {
    const remoteInfos: RemoteDevInfo[] = [];
    for (const key of Object.keys(remotes)) {
      const remote = remotes[key];
      try {
        const url = new URL(remote.entry);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const pathBase = url.pathname.replace(/\/[^/]*$/, '');
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

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'update' || data.type === 'full-reload') {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            invalidateRemoteModules(remote);
          }, 100);
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

  function invalidateRemoteModules(remote: RemoteDevInfo) {
    if (!server) return;

    const proxyModules: Array<
      typeof server.moduleGraph.idToModuleMap extends Map<any, infer V> ? V : never
    > = [];

    const timestamp = Date.now();

    // Step 1: Find and invalidate all proxy virtual modules for this remote
    for (const mod of Array.from(server.moduleGraph.idToModuleMap.values())) {
      if (mod.id && mod.id.startsWith(MF_PROXY_PREFIX) && mod.id.includes(remote.name)) {
        server.moduleGraph.invalidateModule(mod);
        // CRITICAL: Set lastHMRTimestamp so Vite's importAnalysis adds ?t= to import URLs.
        // invalidateModule() only sets lastInvalidationTimestamp, but importAnalysis checks
        // lastHMRTimestamp to decide whether to add cache-busting timestamps to imports.
        mod.lastHMRTimestamp = timestamp;
        proxyModules.push(mod);
      }
    }
    // Step 2: Find importer files (e.g., App.jsx) and trigger Vite's native HMR pipeline.
    // Emitting synthetic 'change' events for importer files makes Vite:
    //   a) Re-transform the importer with updated import timestamps for invalidated deps
    //   b) Compute proper HMR boundaries (React Fast Refresh handles React components)
    //   c) Send updates to the browser with correct timestamp-busted URLs
    const importerFiles = new Set<string>();
    for (const proxyMod of proxyModules) {
      for (const importer of Array.from(proxyMod.importers)) {
        if (importer.file && !importer.id?.startsWith(MF_PROXY_PREFIX)) {
          importerFiles.add(importer.file);
        }
      }
    }

    Array.from(importerFiles).forEach((file) => {
      server.watcher.emit('change', file);
    });
  }
}
