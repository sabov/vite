import { Layout, SharedButton, useLayoutContext } from '@my-org/shared-module';
import React, { Suspense } from 'react';
import { getMfInstance } from './federation';

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
    <p>Error message: {error.message}</p>
    <pre style={{ fontSize: '12px', overflow: 'auto' }}>{error.stack}</pre>
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

      <Layout>
        <HostContent />
      </Layout>

      <div id="remote-container">
        <h2>Remote Container</h2>
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
