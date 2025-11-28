import { createInstance } from '@module-federation/runtime';

import React from 'react';
import ReactDOM from 'react-dom';

import * as SharedModule from '@my-org/shared-module';

let mfInstance: Awaited<ReturnType<typeof createInstance>> | null = null;

const initializeFederation = async (): Promise<void> => {
  if (!mfInstance) {
    console.log('[Host] Initializing Module Federation...');
    console.log('[Host] SharedModule exports:', Object.keys(SharedModule));

    mfInstance = await createInstance({
      name: 'host',
      remotes: [
        {
          name: 'remote',
          entry: 'http://localhost:5001/mf-manifest.json',
          type: 'module',
        },
      ],
      shared: {
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

const getMfInstance = () => {
  if (!mfInstance) {
    throw new Error('Module Federation not initialized. Call initializeFederation() first.');
  }
  return mfInstance;
};

export { getMfInstance, initializeFederation, mfInstance };
