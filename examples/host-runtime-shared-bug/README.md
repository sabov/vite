# Module Federation Bug Reproduction: loadShare CJS Export Issue

This example reproduces a bug in `@module-federation/vite` where the `loadShare` virtual module exports a Promise instead of the resolved module in dev mode when using CJS exports.

## Bug Summary

**Error:** `The requested module '...__loadShare__...js' does not provide an export named 'X'`

### Root Cause

In `src/virtualModules/virtualShared_preBuild.ts`, the `writeLoadShareModule` function generates:

```javascript
const exportModule = /*mf top-level-await placeholder replacement mf*/ res.then((factory) =>
  factory()
);
module.exports = exportModule; // CJS!
```

But `src/plugins/pluginDevProxyModuleTopLevelAwait.ts` only transforms **ESM exports**:

```javascript
// Only handles these:
if (node.type === 'ExportNamedDeclaration') { ... }
if (node.type === 'ExportDefaultDeclaration') { ... }
// Does NOT handle: module.exports = ...
```

**Result:** `module.exports` exports a **Promise**, not the resolved module.

## Key Conditions to Reproduce

1. **Host uses runtime API only** (not the vite plugin for host initialization)

   - Host calls `init()` from `@module-federation/runtime` directly
   - Host provides shared module via `lib: () => Module` syntax

2. **Remote uses vite plugin** with shared dependency declared

   - The shared dependency is a workspace package (not published to npm)
   - It's provided by the host via federation shared scope

3. **Remote is loaded as the index route** (first thing loaded on app start)

4. **Dev mode only** (`vite dev` / `pnpm dev`)

## Project Structure

```
host-runtime-shared-bug/
├── shared-module/           # Workspace package: @my-org/shared-module
│   ├── src/
│   │   └── index.tsx       # The shared module implementation
│   └── package.json
├── host/
│   ├── src/
│   │   ├── federation.ts   # Runtime init with lib()
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json        # NO @module-federation/vite!
│   └── vite.config.ts      # NO federation plugin!
├── remote/
│   ├── src/
│   │   ├── App.tsx         # Imports @my-org/shared-module
│   │   └── main.tsx
│   ├── package.json        # HAS @module-federation/vite
│   └── vite.config.ts      # HAS federation plugin with shared config
├── package.json
└── README.md
```

## Running the Example

```bash
# Install dependencies (from repo root)
pnpm install

# Start both apps (from this directory)
pnpm dev

# Or start separately:
pnpm dev:remote  # Start remote on port 5001
pnpm dev:host    # Start host on port 5000
```

Then open http://localhost:5000

## Expected vs Actual

**Expected:** Remote app loads and displays content using the shared module from host.

**Actual:** Error in console:

```
The requested module '/node_modules/__mf__virtual/...__loadShare__@my-org/shared-module__loadShare__.js'
does not provide an export named 'Layout'
```

## Workaround

Remove `@my-org/shared-module` from remote's `shared` config:

```typescript
// remote/vite.config.ts
shared: {
  // '@my-org/shared-module': { ... }  // REMOVE THIS
},
```

## Proposed Fixes

### Fix 1: Patch `PluginDevProxyModuleTopLevelAwait` to handle CJS exports

Add handling for `module.exports = ...` pattern in the AST walker.

### Fix 2: Change `writeLoadShareModule` to use ESM exports

Change the generated code from `module.exports = exportModule` to `export default exportModule`.
