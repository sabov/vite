import { getNormalizeModuleFederationOptions } from '../utils/normalizeModuleFederationOptions';

export const VIRTUAL_EXPOSES = 'virtual:mf-exposes';
export function generateExposes() {
  const options = getNormalizeModuleFederationOptions();
  return `
    const __mf_ts = () => {
      const ts = globalThis.__mf_expose_ts__;
      return ts ? '?t=' + ts : '';
    };
    export default {
    ${Object.keys(options.exposes)
      .map((key) => {
        return `
        ${JSON.stringify(key)}: async () => {
          const tsQuery = __mf_ts();
          const importModule = await import(${JSON.stringify(options.exposes[key].import)} + tsQuery)
          const exportModule = {}
          Object.assign(exportModule, importModule)
          Object.defineProperty(exportModule, "__esModule", {
            value: true,
            enumerable: false
          })
          return exportModule
        }
      `;
      })
      .join(',')}
  }

  if (import.meta.hot) {
    import.meta.hot.on('mf:module-updated', (data) => {
      globalThis.__mf_expose_ts__ = Date.now();
      window.dispatchEvent(new CustomEvent('mf:module-updated', { detail: data }));
    });
  }
  `;
}
