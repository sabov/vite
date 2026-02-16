import { createFilter } from '@rollup/pluginutils';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import { Plugin } from 'vite';
import { NormalizedModuleFederationOptions } from '../utils/normalizeModuleFederationOptions';
import { addUsedRemote, getRemoteVirtualModule, generateRemotes } from '../virtualModules';
const filter: (id: string) => boolean = createFilter();

export const MF_PROXY_PREFIX = '\0mf-proxy:';

export default function (options: NormalizedModuleFederationOptions): Plugin {
  let command: string;
  const { remotes } = options;

  const remoteNames = Object.keys(remotes).map((key) => remotes[key].name);

  function isRemoteModule(source: string): boolean {
    return remoteNames.some((name) => source === name || source.startsWith(name + '/'));
  }

  return {
    name: 'proxyRemotes',
    config(config, { command: _command }) {
      command = _command;
      Object.keys(remotes).forEach((key) => {
        const remote = remotes[key];
        (config.resolve as any).alias.push({
          find: new RegExp(`^(${remote.name}(\/.*|$))`),
          replacement: '$1',
          customResolver(source: string) {
            addUsedRemote(remote.name, source);
            if (_command === 'serve') {
              return MF_PROXY_PREFIX + source;
            }
            const remoteModule = getRemoteVirtualModule(source, _command);
            return remoteModule.getPath();
          },
        });
      });
    },
    resolveId(id) {
      if (id.startsWith(MF_PROXY_PREFIX)) {
        return id;
      }
    },
    load(id) {
      if (id.startsWith(MF_PROXY_PREFIX)) {
        const source = id.slice(MF_PROXY_PREFIX.length);
        return generateRemotes(source, command);
      }
    },
    transform(code, id) {
      if (command !== 'serve') return null;
      if (!remoteNames.some((name) => code.includes(name))) return null;
      if (id.startsWith('\0') || id.includes('node_modules')) return null;
      if (!filter(id)) return null;

      let ast: any;
      try {
        ast = (this as any).parse(code);
      } catch {
        return null;
      }

      const s = new MagicString(code);
      let counter = 0;
      let hasChanges = false;

      walk(ast, {
        enter(node: any) {
          if (node.type !== 'ImportDeclaration') return;
          const source = node.source?.value;
          if (!source || !isRemoteModule(source)) return;

          const specifiers = node.specifiers || [];
          if (!specifiers.length) return;

          const defaultSpec = specifiers.find((s: any) => s.type === 'ImportDefaultSpecifier');
          const namedSpecs = specifiers.filter((s: any) => s.type === 'ImportSpecifier');
          const nsSpec = specifiers.find((s: any) => s.type === 'ImportNamespaceSpecifier');

          // Only transform if there are named imports (or mixed)
          // Pure default or pure namespace imports work fine with `export default mod`
          const needsTransform = namedSpecs.length > 0;
          if (!needsTransform) {
            // For pure default import, we still need to transform because
            // `export default mod` gives the full module, not mod.default
            if (defaultSpec && !nsSpec) {
              const tempName = `__mfRemote_${counter++}`;
              const parts: string[] = [];
              parts.push(`import ${tempName} from ${JSON.stringify(source)};`);
              parts.push(`const ${defaultSpec.local.name} = ${tempName}.default ?? ${tempName};`);
              s.overwrite(node.start, node.end, parts.join('\n'));
              hasChanges = true;
            }
            return;
          }

          const tempName = `__mfRemote_${counter++}`;
          const parts: string[] = [];

          parts.push(`import ${tempName} from ${JSON.stringify(source)};`);

          if (defaultSpec) {
            parts.push(`const ${defaultSpec.local.name} = ${tempName}.default ?? ${tempName};`);
          }

          if (namedSpecs.length) {
            const destructured = namedSpecs
              .map((spec: any) => {
                const imported = spec.imported.name;
                const local = spec.local.name;
                return imported === local ? imported : `${imported}: ${local}`;
              })
              .join(', ');
            parts.push(`const { ${destructured} } = ${tempName};`);
          }

          if (nsSpec) {
            parts.push(`const ${nsSpec.local.name} = ${tempName};`);
          }

          s.overwrite(node.start, node.end, parts.join('\n'));
          hasChanges = true;
        },
      });

      if (!hasChanges) return null;

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
      };
    },
  };
}
