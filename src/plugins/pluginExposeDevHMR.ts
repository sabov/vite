import * as path from 'pathe';
import { Plugin, ViteDevServer, ModuleNode } from 'vite';
import { NormalizedModuleFederationOptions } from '../utils/normalizeModuleFederationOptions';

/**
 * Plugin for the REMOTE side that enables HMR for exposed modules.
 *
 * Two problems are solved:
 *
 * 1. Exposed modules are loaded via unanalyzable dynamic imports in
 *    virtual:mf-exposes (e.g. `import("./src/App1" + tsQuery)`), so Vite's
 *    module graph doesn't track them. This plugin intercepts file changes,
 *    manually finds the modules, and feeds them back into Vite's HMR pipeline.
 *
 * 2. When a host app uses runtime module federation (@module-federation/runtime)
 *    without the build plugin, the remote's React Fast Refresh runs in a
 *    separate runtime instance and can't re-render the host's React tree.
 *    This plugin sends a custom WebSocket event ('mf:module-updated') that
 *    client-side code in virtual:mf-exposes bridges to a window CustomEvent,
 *    allowing the host's component wrapper to detect changes and re-render.
 */
export function pluginExposeDevHMR(options: NormalizedModuleFederationOptions): Plugin {
  const { exposes, name: federationName } = options;
  let server: ViteDevServer;
  let resolvedRoot: string;

  const exposeSourcePaths = new Set<string>();
  // Maps absolute file paths (without extension) to expose keys (e.g. "./App1")
  const absToExposeKey = new Map<string, string>();

  return {
    name: 'module-federation-expose-dev-hmr',
    apply: 'serve',

    configResolved(config) {
      resolvedRoot = config.root;
      for (const key of Object.keys(exposes)) {
        const importPath = exposes[key].import;
        const abs = path.resolve(resolvedRoot, importPath);
        exposeSourcePaths.add(abs);
        absToExposeKey.set(abs, key);
      }
    },

    configureServer(_server) {
      server = _server;
    },

    handleHotUpdate({ file, server: _server, timestamp }) {
      if (!isExposedSourceFile(file)) return;

      const modules = findModulesForFile(_server, file);
      if (modules.length === 0) return;

      const exposeKey = getExposeKeyForFile(file);
      if (exposeKey) {
        _server.hot.send({
          type: 'custom',
          event: 'mf:module-updated',
          data: {
            remoteName: federationName,
            exposeKey,
            timestamp,
          },
        });
      }

      return modules;
    },
  };

  function isExposedSourceFile(file: string): boolean {
    for (const exposePath of exposeSourcePaths) {
      if (file === exposePath || file.startsWith(exposePath)) return true;
      // Handle extensionless expose paths (e.g. './src/App1' matches './src/App1.jsx')
      const withoutExt = file.replace(/\.[^/.]+$/, '');
      if (withoutExt === exposePath) return true;
    }

    // Also check if the file is imported by any exposed module
    if (server) {
      const mods = server.moduleGraph.getModulesByFile(file);
      if (mods) {
        for (const mod of mods) {
          if (isImportedByExpose(mod, new Set())) return true;
        }
      }
    }

    return false;
  }

  function isImportedByExpose(mod: ModuleNode, visited: Set<ModuleNode>): boolean {
    if (visited.has(mod)) return false;
    visited.add(mod);

    for (const importer of mod.importers) {
      if (importer.file) {
        for (const exposePath of exposeSourcePaths) {
          const withoutExt = importer.file.replace(/\.[^/.]+$/, '');
          if (importer.file === exposePath || withoutExt === exposePath) return true;
        }
      }
      if (isImportedByExpose(importer, visited)) return true;
    }
    return false;
  }

  function getExposeKeyForFile(file: string): string | undefined {
    const withoutExt = file.replace(/\.[^/.]+$/, '');
    for (const [absPath, key] of absToExposeKey) {
      if (file === absPath || withoutExt === absPath) return key;
    }
    // Check transitive imports
    if (server) {
      const mods = server.moduleGraph.getModulesByFile(file);
      if (mods) {
        for (const mod of mods) {
          const key = findExposeKeyViaImporters(mod, new Set());
          if (key) return key;
        }
      }
    }
    return undefined;
  }

  function findExposeKeyViaImporters(
    mod: ModuleNode,
    visited: Set<ModuleNode>
  ): string | undefined {
    if (visited.has(mod)) return undefined;
    visited.add(mod);
    for (const importer of mod.importers) {
      if (importer.file) {
        const withoutExt = importer.file.replace(/\.[^/.]+$/, '');
        for (const [absPath, key] of absToExposeKey) {
          if (importer.file === absPath || withoutExt === absPath) return key;
        }
      }
      const key = findExposeKeyViaImporters(importer, visited);
      if (key) return key;
    }
    return undefined;
  }

  function findModulesForFile(_server: ViteDevServer, file: string): ModuleNode[] {
    const mods = _server.moduleGraph.getModulesByFile(file);
    if (mods && mods.size > 0) {
      return Array.from(mods);
    }
    return [];
  }
}
