import VirtualModule from '../utils/VirtualModule';
import { virtualRuntimeInitStatus } from './virtualRuntimeInitStatus';

const cacheRemoteMap: {
  [remote: string]: VirtualModule;
} = {};
export const LOAD_REMOTE_TAG = '__loadRemote__';
export function getRemoteVirtualModule(remote: string, command: string) {
  if (!cacheRemoteMap[remote]) {
    cacheRemoteMap[remote] = new VirtualModule(remote, LOAD_REMOTE_TAG, '.js');
    cacheRemoteMap[remote].writeSync(generateRemotes(remote, command));
  }
  const virtual = cacheRemoteMap[remote];
  return virtual;
}
const usedRemotesMap: Record<string, Set<string>> = {
  // remote1: {remote1/App, remote1, remote1/Button}
};
export function addUsedRemote(remoteKey: string, remoteModule: string) {
  if (!usedRemotesMap[remoteKey]) usedRemotesMap[remoteKey] = new Set();
  usedRemotesMap[remoteKey].add(remoteModule);
}
export function getUsedRemotesMap() {
  return usedRemotesMap;
}
export function generateRemotes(id: string, command: string) {
  if (command === 'serve') {
    return generateRemotesDev(id);
  }
  return generateRemotesBuild(id);
}

function generateRemotesBuild(id: string) {
  return `
    const {initPromise} = require("${virtualRuntimeInitStatus.getImportId()}")
    const res = initPromise.then(runtime => runtime.loadRemote(${JSON.stringify(id)}))
    const exportModule = await initPromise.then(_ => res)
    module.exports = exportModule
  `;
}

function generateRemotesDev(id: string) {
  // Extract remote name from id (e.g. "@namespace/viteViteRemote/App1" → "@namespace/viteViteRemote")
  const parts = id.split('/');
  let remoteName = id;
  if (parts[0].startsWith('@') && parts.length >= 2) {
    // Scoped: @scope/name or @scope/name/expose
    remoteName = parts[0] + '/' + parts[1];
  } else if (parts.length > 1) {
    remoteName = parts[0];
  }

  return `
import initStatus from "${virtualRuntimeInitStatus.getImportId()}";
const { initPromise } = initStatus;
const runtime = await initPromise;

function clearMFCaches() {
  const fullId = ${JSON.stringify(id)};
  const remote = ${JSON.stringify(remoteName)};

  if (runtime.moduleCache) {
    runtime.moduleCache.delete(fullId);
    runtime.moduleCache.delete(remote);
    for (const key of runtime.moduleCache.keys()) {
      if (key && key.includes(remote)) runtime.moduleCache.delete(key);
    }
  }
  const gl = globalThis.__GLOBAL_LOADING_REMOTE_ENTRY__;
  if (gl) {
    Object.keys(gl).forEach(k => { if (k.includes(remote)) delete gl[k]; });
  }
  Object.keys(globalThis)
    .filter(k => k.includes('FEDERATION') && k.includes(remote))
    .forEach(k => { delete globalThis[k]; });
  if (runtime.remoteHandler && runtime.remoteHandler.idToRemoteMap) {
    for (const [key] of Object.entries(runtime.remoteHandler.idToRemoteMap)) {
      if (key.includes(remote)) delete runtime.remoteHandler.idToRemoteMap[key];
    }
  }
}

// Track whether this proxy has been loaded before (for HMR cache busting)
if (!globalThis.__mf_loaded_remotes__) globalThis.__mf_loaded_remotes__ = new Set();
const isReload = globalThis.__mf_loaded_remotes__.has(${JSON.stringify(id)});
globalThis.__mf_loaded_remotes__.add(${JSON.stringify(id)});

if (isReload) {
  clearMFCaches();
  globalThis.__mf_expose_ts__ = Date.now();
}

const mod = await runtime.loadRemote(${JSON.stringify(id)});
export default mod;
`;
}
