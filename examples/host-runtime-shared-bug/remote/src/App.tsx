import React from 'react';
// This import triggers the bug!
import { Layout, SharedButton } from '@my-org/shared-module';

const RemoteContent: React.FC = () => {
  return (
    <div style={{ padding: '15px', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
      <h3 style={{ color: '#e94560', margin: '0 0 15px 0' }}>
        🎉 Remote Component Loaded Successfully!
      </h3>
      <p>This proves the shared module is working correctly.</p>
      <SharedButton>Shared Button</SharedButton>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Layout>
      <div
        style={{
          fontSize: '12px',
          color: '#888',
          marginBottom: '10px',
          padding: '5px',
          backgroundColor: '#0f3460',
          borderRadius: '4px',
        }}
      >
        🔌 Remote App - using Layout from @my-org/shared-module (provided by host)
      </div>
      <RemoteContent />
    </Layout>
  );
};

export default App;
