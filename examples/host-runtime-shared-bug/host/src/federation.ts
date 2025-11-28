/**
 * Host uses RUNTIME API directly, NOT the vite plugin
 *
 * Initialize module federation runtime BEFORE rendering.
 * This ensures the shared scope is available BEFORE any remote modules load.
 */
import { init } from '@module-federation/runtime';

// Import React and ReactDOM for sharing
import React from 'react';
import ReactDOM from 'react-dom';

// Import from the workspace package
import * as SharedModule from '@my-org/shared-module';

// Initialize module federation runtime
let mfInstance: Awaited<ReturnType<typeof init>> | null = null;

const initializeFederation = async (): Promise<void> => {
  if (!mfInstance) {
    console.log('[Host] Initializing Module Federation...');
    console.log('[Host] SharedModule exports:', Object.keys(SharedModule));

    mfInstance = await init({
      name: 'host',
      remotes: [
        {
          name: 'remote',
          entry: 'http://localhost:5001/mf-manifest.json',
          type: 'module',
        },
      ],
      shared: {
        // React shared - provide the actual module
        react: {
          version: '18.3.1',
          scope: 'default',
          lib: () => React,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18.0.0',
          },
        },
        'react-dom': {
          version: '18.3.1',
          scope: 'default',
          lib: () => ReactDOM,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18.0.0',
          },
        },
        // This is the KEY part - workspace package shared via lib()
        '@my-org/shared-module': {
          version: '1.0.0',
          scope: 'default',
          lib: () => SharedModule,
          shareConfig: {
            singleton: true,
            requiredVersion: '1.0.0',
          },
        },
      },
    });

    console.log('[Host] Module Federation initialized');
  }
};

// Getter for mfInstance (use after initialization)
const getMfInstance = () => {
  if (!mfInstance) {
    throw new Error('Module Federation not initialized. Call initializeFederation() first.');
  }
  return mfInstance;
};

export { getMfInstance, initializeFederation, mfInstance };
