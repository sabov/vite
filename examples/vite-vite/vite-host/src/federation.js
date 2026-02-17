import { createInstance } from '@module-federation/runtime';
import React from 'react';
import ReactDOM from 'react-dom';

let mfInstance = null;

const REMOTES = [
  {
    name: '@namespace/viteViteRemote',
    entry: 'http://localhost:5176/testbase/mf-manifest.json',
  },
];

export const initializeFederation = async () => {
  if (!mfInstance) {
    mfInstance = await createInstance({
      name: 'viteViteHost',
      remotes: REMOTES.map((remote) => ({
        name: remote.name,
        type: 'module',
        entry: remote.entry,
        shareScope: 'default',
      })),
      shared: {
        react: {
          version: '18.3.1',
          scope: 'default',
          lib: () => React,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18',
          },
        },
        'react-dom': {
          version: '18.3.1',
          scope: 'default',
          lib: () => ReactDOM,
          shareConfig: {
            singleton: true,
            requiredVersion: '^18',
          },
        },
      },
    });
  }
};

export { mfInstance };
