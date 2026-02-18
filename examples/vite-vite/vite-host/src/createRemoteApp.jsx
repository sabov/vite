import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';

function clearFederationCache(instance, remoteName, moduleId) {
  if (instance.moduleCache) {
    instance.moduleCache.delete(moduleId);
    instance.moduleCache.delete(remoteName);
    for (const key of instance.moduleCache.keys()) {
      if (key && key.includes(remoteName)) instance.moduleCache.delete(key);
    }
  }
  const gl = globalThis.__GLOBAL_LOADING_REMOTE_ENTRY__;
  if (gl) {
    Object.keys(gl).forEach((k) => {
      if (k.includes(remoteName)) delete gl[k];
    });
  }
  Object.keys(globalThis)
    .filter((k) => k.includes('FEDERATION') && k.includes(remoteName))
    .forEach((k) => {
      delete globalThis[k];
    });
  if (instance.remoteHandler && instance.remoteHandler.idToRemoteMap) {
    for (const key of Object.keys(instance.remoteHandler.idToRemoteMap)) {
      if (key.includes(remoteName)) delete instance.remoteHandler.idToRemoteMap[key];
    }
  }
}

export function createRemoteApp({ instance, remoteName, moduleName, exportName = 'default' }) {
  const moduleId = `${remoteName}/${moduleName}`;
  const exposeKey = `./${moduleName}`;

  async function loadComponent() {
    const mod = await instance.loadRemote(moduleId);
    const component = mod?.[exportName] || mod?.default;
    if (!component) {
      return () => (
        <div>
          Error: No export &quot;{exportName}&quot; found for {moduleId}
        </div>
      );
    }
    return component;
  }

  // In production, use React.lazy for optimal code splitting
  if (!import.meta.env.DEV) {
    const RemoteCmp = lazy(async () => ({
      default: await loadComponent(),
    }));
    const RemoteApp = (props) => (
      <Suspense fallback={<div>Loading {moduleName}...</div>}>
        <RemoteCmp {...props} />
      </Suspense>
    );
    RemoteApp.displayName = `RemoteApp(${moduleId})`;
    return RemoteApp;
  }

  // In dev mode, support HMR by listening for remote module updates
  const RemoteApp = (props) => {
    const [Component, setComponent] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
      (bustCache) => {
        if (bustCache) {
          clearFederationCache(instance, remoteName, moduleId);
          globalThis.__mf_expose_ts__ = Date.now();
        }
        setLoading(true);
        loadComponent().then((cmp) => {
          setComponent(() => cmp);
          setLoading(false);
        });
      },
      [instance, remoteName, moduleId]
    );

    useEffect(() => {
      load(false);
    }, [load]);

    useEffect(() => {
      const handler = (e) => {
        const detail = e.detail || {};
        if (detail.exposeKey === exposeKey || detail.remoteName === remoteName) {
          load(true);
        }
      };
      window.addEventListener('mf:module-updated', handler);
      return () => window.removeEventListener('mf:module-updated', handler);
    }, [load, exposeKey, remoteName]);

    if (loading && !Component) return <div>Loading {moduleName}...</div>;
    return Component ? <Component {...props} /> : null;
  };

  RemoteApp.displayName = `RemoteApp(${moduleId})`;
  return RemoteApp;
}
