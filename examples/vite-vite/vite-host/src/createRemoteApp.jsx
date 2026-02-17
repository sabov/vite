import React, { Suspense, lazy } from 'react';

export function createRemoteApp({ instance, remoteName, moduleName, exportName = 'default' }) {
  const RemoteCmp = lazy(async () => {
    const mod = await instance.loadRemote(`${remoteName}/${moduleName}`);
    const component = mod?.[exportName] || mod?.default;
    if (!component) {
      return {
        default: () => (
          <div>
            Error: No export &quot;{exportName}&quot; found for {remoteName}/{moduleName}
          </div>
        ),
      };
    }
    return { default: component };
  });

  const RemoteApp = (props) => (
    <Suspense fallback={<div>Loading {moduleName}...</div>}>
      <RemoteCmp {...props} />
    </Suspense>
  );

  RemoteApp.displayName = `RemoteApp(${remoteName}/${moduleName})`;
  return RemoteApp;
}
