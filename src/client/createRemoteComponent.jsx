import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';

/**
 * Clear all Module Federation runtime caches for a given remote.
 * This ensures that the next loadRemote() call fetches fresh modules.
 */
function clearMFCaches(instance, remoteName) {
  // Clear the MF runtime module cache
  if (instance.moduleCache) {
    for (const key of instance.moduleCache.keys()) {
      if (key && key.includes(remoteName)) {
        instance.moduleCache.delete(key);
      }
    }
  }

  // Clear global loading remote entry cache
  const gl = globalThis.__GLOBAL_LOADING_REMOTE_ENTRY__;
  if (gl) {
    Object.keys(gl).forEach((k) => {
      if (k.includes(remoteName)) delete gl[k];
    });
  }

  // Clear federation globals
  Object.keys(globalThis)
    .filter((k) => k.includes('FEDERATION') && k.includes(remoteName))
    .forEach((k) => {
      delete globalThis[k];
    });

  // Clear remote handler map
  if (instance.remoteHandler && instance.remoteHandler.idToRemoteMap) {
    for (const key of Object.keys(instance.remoteHandler.idToRemoteMap)) {
      if (key.includes(remoteName)) {
        delete instance.remoteHandler.idToRemoteMap[key];
      }
    }
  }

  // Signal to the remote's expose module to use cache-busting timestamps
  globalThis.__mf_expose_ts__ = Date.now();
}

/**
 * Creates an HMR-aware React component that loads a remote module via
 * Module Federation runtime. When the remote's source files change,
 * this component automatically re-fetches the updated module and
 * re-renders without a full page reload.
 *
 * Requires the host to use the runtimeFederationDev() Vite plugin,
 * which sends 'mf:remote-update' HMR events when remotes change.
 *
 * Usage:
 *   import { createRemoteComponent } from '@module-federation/vite/client';
 *
 *   const RemoteApp = createRemoteComponent({
 *     instance: mfInstance,
 *     remoteName: '@namespace/remote',
 *     moduleName: 'App',
 *   });
 *
 *   function Host() {
 *     return <RemoteApp />;
 *   }
 */
export function createRemoteComponent({
  instance,
  remoteName,
  moduleName,
  exportName = 'default',
  fallback,
}) {
  function RemoteComponent(props) {
    const [version, setVersion] = useState(0);

    const LazyComponent = useMemo(() => {
      return lazy(async () => {
        if (version > 0) {
          clearMFCaches(instance, remoteName);
        }
        const mod = await instance.loadRemote(`${remoteName}/${moduleName}`);
        const component = mod?.[exportName] || mod?.default;
        if (!component) {
          return {
            default: () =>
              React.createElement(
                'div',
                null,
                `Error: No export "${exportName}" found for ${remoteName}/${moduleName}`
              ),
          };
        }
        return { default: component };
      });
    }, [version]);

    useEffect(() => {
      if (import.meta.hot) {
        const handler = (data) => {
          if (data.remote === remoteName) {
            setVersion((v) => v + 1);
          }
        };
        import.meta.hot.on('mf:remote-update', handler);
        return () => {
          import.meta.hot.off('mf:remote-update', handler);
        };
      }
    }, []);

    return React.createElement(
      Suspense,
      { fallback: fallback || React.createElement('div', null, `Loading ${moduleName}...`) },
      React.createElement(LazyComponent, props)
    );
  }

  RemoteComponent.displayName = `RemoteComponent(${remoteName}/${moduleName})`;
  return RemoteComponent;
}
