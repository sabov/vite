import defu from 'defu';
import { readFileSync } from 'fs';
import { Plugin } from 'vite';
import addEntry from './plugins/pluginAddEntry';
import { checkAliasConflicts } from './plugins/pluginCheckAliasConflicts';
import { PluginDevProxyModuleTopLevelAwait } from './plugins/pluginDevProxyModuleTopLevelAwait';
import pluginDts from './plugins/pluginDts';
import pluginManifest from './plugins/pluginMFManifest';
import pluginModuleParseEnd from './plugins/pluginModuleParseEnd';
import pluginProxyRemoteEntry from './plugins/pluginProxyRemoteEntry';
import pluginProxyRemotes from './plugins/pluginProxyRemotes';
import { proxySharedModule } from './plugins/pluginProxySharedModule_preBuild';
import pluginVarRemoteEntry from './plugins/pluginVarRemoteEntry';
import aliasToArrayPlugin from './utils/aliasToArrayPlugin';
import {
  ModuleFederationOptions,
  normalizeModuleFederationOptions,
} from './utils/normalizeModuleFederationOptions';
import normalizeOptimizeDepsPlugin from './utils/normalizeOptimizeDeps';
import VirtualModule from './utils/VirtualModule';
import {
  getHostAutoInitImportId,
  getHostAutoInitPath,
  getLocalSharedImportMapPath,
  getPreBuildLibImportId,
  initVirtualModules,
  LOAD_REMOTE_TAG,
  LOAD_SHARE_TAG,
  REMOTE_ENTRY_ID,
  virtualRuntimeInitStatus,
} from './virtualModules';
import { VIRTUAL_EXPOSES } from './virtualModules/virtualExposes';

function federation(mfUserOptions: ModuleFederationOptions): Plugin[] {
  const options = normalizeModuleFederationOptions(mfUserOptions);
  const { name, remotes, shared, filename, hostInitInjectLocation } = options;
  if (!name) throw new Error('name is required');

  let command: string;

  return [
    {
      name: 'vite:module-federation-config',
      enforce: 'pre',
      config(_config, env) {
        command = env.command;
      },
      configResolved(config) {
        // Set root path
        VirtualModule.setRoot(config.root);
        // Ensure virtual package directory exists
        VirtualModule.ensureVirtualPackageExists();
        initVirtualModules(command);
      },
    },
    aliasToArrayPlugin,
    checkAliasConflicts({ shared }),
    normalizeOptimizeDepsPlugin,
    ...pluginDts(options),
    ...addEntry({
      entryName: 'remoteEntry',
      entryPath: REMOTE_ENTRY_ID,
      fileName: filename,
    }),
    ...addEntry({
      entryName: 'hostInit',
      entryPath: getHostAutoInitPath(),
      inject: hostInitInjectLocation,
    }),
    ...addEntry({
      entryName: 'virtualExposes',
      entryPath: VIRTUAL_EXPOSES,
    }),
    pluginProxyRemoteEntry(),
    pluginProxyRemotes(options),
    ...pluginModuleParseEnd(
      (id: string) => {
        return (
          id.includes(getHostAutoInitImportId()) ||
          id.includes(REMOTE_ENTRY_ID) ||
          id.includes(VIRTUAL_EXPOSES) ||
          id.includes(getLocalSharedImportMapPath())
        );
      },
      {
        moduleParseTimeout: options.moduleParseTimeout,
      }
    ),
    ...proxySharedModule({
      shared,
    }),
    {
      name: 'module-federation-esm-shims',
      enforce: 'pre',
      apply: 'build',
      load(id) {
        if (id.startsWith('\0')) return;
        if (id.includes(LOAD_SHARE_TAG) || id.includes(LOAD_REMOTE_TAG)) {
          let code = readFileSync(id, 'utf-8');
          /**
           * Shared/remote shims only have `export default exportModule`.
           *
           * We add a second named export (__moduleExports) that holds the full
           * module namespace and point syntheticNamedExports at it.  This lets
           * Rollup resolve named imports (e.g. `import { useState } from 'react'`)
           * from the namespace while still applying its normal default-export
           * interop — which is needed for libraries like @emotion/styled where
           * `import styled from '@emotion/styled'` must receive the .default
           * function, not the raw namespace object.
           *
           * Using 'default' as the syntheticNamedExports key would skip the
           * interop and break default imports.
           *
           * @see https://rollupjs.org/plugin-development/#synthetic-named-exports
           */
          code = code.replace(
            'export default exportModule',
            'export const __moduleExports = exportModule;\n' +
              'export default exportModule.__esModule ? exportModule.default : exportModule'
          );
          return { code, syntheticNamedExports: '__moduleExports' };
        }
      },
    },
    PluginDevProxyModuleTopLevelAwait(),
    {
      name: 'module-federation-vite',
      enforce: 'post',
      // @ts-expect-error
      // used to expose plugin options: https://github.com/rolldown/rolldown/discussions/2577#discussioncomment-11137593
      _options: options,
      config(config, { command: _command }: { command: string }) {
        // TODO: singleton
        (config.resolve as any).alias.push({
          find: '@module-federation/runtime',
          replacement: options.implementation,
        });
        config.build = defu(config.build || {}, {
          commonjsOptions: {
            strictRequires: 'auto',
          },
        });
        const virtualDir = options.virtualModuleDir || '__mf__virtual';
        config.optimizeDeps?.include?.push('@module-federation/runtime');
        config.optimizeDeps?.include?.push(virtualDir);
        config.optimizeDeps?.needsInterop?.push(virtualDir);
        config.optimizeDeps?.needsInterop?.push(getLocalSharedImportMapPath());

        // Pre-include the runtimeInit virtual module to prevent Vite from
        // discovering it at runtime, which triggers dep re-optimization and
        // causes a double full-page reload on cold start.
        // See: https://github.com/module-federation/vite/issues/424
        const runtimeInitId = virtualRuntimeInitStatus.getImportId();
        config.optimizeDeps?.include?.push(runtimeInitId);
        config.optimizeDeps?.needsInterop?.push(runtimeInitId);

        // Pre-include all shared modules so Vite's dep optimizer records them
        // in the optimization metadata during the initial scan. Without this,
        // the loadShare proxy prevents Vite from discovering shared packages'
        // transitive dependencies, causing runtime dep discovery and a full
        // page reload on cold start.
        // The loadShare proxy's live import() hint (not wrapped in an arrow
        // function) lets esbuild naturally discover __prebuild__ modules as
        // transitive dependencies, so they don't need explicit enumeration.
        // See: https://github.com/module-federation/vite/issues/424
        for (const key of Object.keys(shared)) {
          if (key.endsWith('/')) {
            const pkgName = key.slice(0, -1);
            // Always include the base package name
            config.optimizeDeps?.include?.push(pkgName);
            // For packages with an `exports` field, also use a glob pattern
            // so Vite enumerates all exported subpaths (e.g. react/jsx-runtime)
            // into the optimization metadata. Without `exports`, Vite falls
            // back to a filesystem glob that can include .d.ts and other
            // non-JS files, crashing esbuild.
            try {
              const pkgJson = JSON.parse(
                readFileSync(require.resolve(`${pkgName}/package.json`), 'utf-8')
              );
              if (
                pkgJson.exports &&
                typeof pkgJson.exports === 'object' &&
                !Array.isArray(pkgJson.exports)
              ) {
                config.optimizeDeps?.include?.push(`${pkgName}/**`);
              }
            } catch {
              // package.json not accessible — base name already included above
            }
          } else {
            config.optimizeDeps?.include?.push(key);
          }
        }

        // Pre-include __prebuild__ virtual modules for all shared packages.
        // The localSharedImportMap dynamically imports __prebuild__ modules
        // to load actual package code (bypassing the loadShare proxy).
        // Without pre-including them, they are discovered at runtime via
        // registerMissingImport, triggering dep re-optimization and page reload.
        // See: https://github.com/module-federation/vite/issues/424
        for (const key of Object.keys(shared)) {
          const prebuildNames: string[] = [];

          if (key.endsWith('/')) {
            const pkgName = key.slice(0, -1);
            prebuildNames.push(pkgName);
            // Enumerate subpath exports so their __prebuild__ modules are
            // also pre-included (e.g. react/jsx-runtime, react/jsx-dev-runtime)
            try {
              const pkgJson = JSON.parse(
                readFileSync(require.resolve(`${pkgName}/package.json`), 'utf-8')
              );
              if (
                pkgJson.exports &&
                typeof pkgJson.exports === 'object' &&
                !Array.isArray(pkgJson.exports)
              ) {
                for (const exportKey of Object.keys(pkgJson.exports)) {
                  if (exportKey === '.' || exportKey === './package.json') continue;
                  if (!exportKey.startsWith('./')) continue;
                  if (exportKey.includes('*')) continue;
                  prebuildNames.push(`${pkgName}/${exportKey.slice(2)}`);
                }
              }
            } catch {
              // package.json not accessible
            }
          } else {
            prebuildNames.push(key);
          }

          for (const name of prebuildNames) {
            const prebuildId = getPreBuildLibImportId(name);
            config.optimizeDeps?.include?.push(prebuildId);
          }
        }

        // Resolve target: explicit option > SSR detection > 'web'
        const resolvedTarget = options.target ?? (config.build?.ssr ? 'node' : 'web');

        // Set ENV_TARGET define for tree-shaking Node.js code from the federation runtime
        if (!config.define) config.define = {};
        if (!('ENV_TARGET' in config.define)) {
          config.define['ENV_TARGET'] = JSON.stringify(resolvedTarget);
        }

        if (
          options.target &&
          'ENV_TARGET' in config.define &&
          config.define['ENV_TARGET'] !== JSON.stringify(options.target)
        ) {
          console.warn(
            `[module-federation] ENV_TARGET define (${config.define['ENV_TARGET']}) differs from target option ("${options.target}"). ENV_TARGET will not be overridden.`
          );
        }
      },
    },
    ...pluginManifest(),
    ...pluginVarRemoteEntry(),
  ];
}

export { federation };
