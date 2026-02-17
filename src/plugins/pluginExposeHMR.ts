import * as path from 'pathe';
import { Plugin, ViteDevServer } from 'vite';
import { NormalizedModuleFederationOptions } from '../utils/normalizeModuleFederationOptions';

/**
 * Plugin that intercepts HMR updates for exposed module files on the remote side.
 *
 * Instead of letting Vite's normal HMR pipeline run (which would fall back to
 * full-reload since there's no HMR boundary for exposed modules), this plugin:
 * 1. Sends a custom 'mf:remote-changed' event via the server's HMR channel
 * 2. Returns [] to suppress Vite's normal HMR processing
 *
 * This custom event can be picked up by the host-side runtimeFederationDev plugin
 * to trigger graceful HMR updates without a full page reload.
 */
export function pluginExposeHMR(options: NormalizedModuleFederationOptions): Plugin {
  let server: ViteDevServer;
  let root: string;

  // Resolved absolute paths of exposed module files
  let resolvedExposePaths: string[] = [];

  return {
    name: 'module-federation-expose-hmr',
    apply: 'serve',

    configResolved(config) {
      root = config.root;
      resolvedExposePaths = Object.values(options.exposes).map((item) => {
        const importPath = item.import;
        // Resolve relative paths against the project root
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          return path.resolve(root, importPath);
        }
        return importPath;
      });
    },

    configureServer(_server) {
      server = _server;
    },

    handleHotUpdate(ctx) {
      if (!server || !ctx.file) return;

      // Check if the changed file is an exposed module or a dependency of one
      const isExposedFile = isFileExposed(ctx.file, ctx.modules);
      if (!isExposedFile) return;

      // Send custom event instead of full-reload
      server.hot.send({
        type: 'custom',
        event: 'mf:remote-changed',
        data: { name: options.name },
      });

      // Return empty array to suppress Vite's normal HMR pipeline
      // (which would fall back to full-reload for exposed modules)
      return [];
    },
  };

  function isFileExposed(file: string, modules: readonly any[]): boolean {
    // Direct match: the changed file is one of the exposed entry files
    const fileWithoutExt = file.replace(/\.[^.]+$/, '');
    for (const exposePath of resolvedExposePaths) {
      const exposeWithoutExt = exposePath.replace(/\.[^.]+$/, '');
      if (
        file === exposePath ||
        file.startsWith(exposePath) ||
        fileWithoutExt === exposeWithoutExt
      ) {
        return true;
      }
    }

    // Transitive dependency check: walk the module graph to see if any
    // of the affected modules are imported (directly or transitively) by
    // an exposed module
    if (modules.length > 0) {
      for (const mod of modules) {
        if (isModuleImportedByExpose(mod, new Set())) {
          return true;
        }
      }
    }

    return false;
  }

  function isModuleImportedByExpose(mod: any, visited: Set<string>): boolean {
    if (!mod.id || visited.has(mod.id)) return false;
    visited.add(mod.id);

    // Check if this module itself is an exposed file
    const modFile = mod.file || mod.id;
    const modWithoutExt = modFile.replace(/\.[^.]+$/, '');
    for (const exposePath of resolvedExposePaths) {
      const exposeWithoutExt = exposePath.replace(/\.[^.]+$/, '');
      if (modFile === exposePath || modWithoutExt === exposeWithoutExt) {
        return true;
      }
    }

    // Recursively check importers
    if (mod.importers) {
      for (const importer of mod.importers) {
        if (isModuleImportedByExpose(importer, visited)) {
          return true;
        }
      }
    }

    return false;
  }
}
