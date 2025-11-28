import React, { Suspense } from 'react';
import { getMfInstance } from './federation';
// Import from the workspace package
import { Layout, SharedButton, useLayoutContext } from '@my-org/shared-module';

// Dynamically load the remote component
const RemoteApp = React.lazy(async () => {
  console.log('[Host] Loading remote/App...');
  try {
    const mfInstance = getMfInstance();
    const module = await mfInstance.loadRemote<{ default: React.ComponentType }>('remote/App');
    console.log('[Host] Remote loaded successfully:', module);
    return module!;
  } catch (error) {
    console.error('[Host] Failed to load remote:', error);
    throw error;
  }
});

const HostContent: React.FC = () => {
  const { theme, appName } = useLayoutContext();

  return (
    <div>
      <h2>Host App Content</h2>
      <p>Theme: {theme}</p>
      <p>App Name: {appName}</p>
      <SharedButton>Shared Button</SharedButton>
    </div>
  );
};

const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="error">
    <h3>❌ Error Loading Remote</h3>
    <p>
      <strong>This is the bug we're reproducing!</strong>
    </p>
    <p>Error message: {error.message}</p>
    <pre style={{ fontSize: '12px', overflow: 'auto' }}>{error.stack}</pre>
    <hr />
    <p>
      <strong>Expected behavior:</strong> The remote should load and display its content using the
      shared module provided by the host.
    </p>
    <p>
      <strong>Actual behavior:</strong> In dev mode, when the remote tries to import from
      @my-org/shared-module, it gets a Promise instead of the resolved module because the loadShare
      virtual module uses CJS exports which aren't transformed by pluginDevProxyModuleTopLevelAwait.
    </p>
  </div>
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (error: Error) => React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <div>
      <h1>🐛 Module Federation Bug Reproduction</h1>
      <p>
        This example reproduces the bug where <code>loadShare</code> virtual module exports a
        Promise instead of the resolved module in dev mode when using CJS exports.
      </p>

      <Layout>
        <HostContent />
      </Layout>

      <div id="remote-container">
        <h2>Remote Container</h2>
        <p>Loading remote that imports @my-org/shared-module...</p>
        <ErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
          <Suspense fallback={<div>⏳ Loading remote...</div>}>
            <RemoteApp />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default App;
