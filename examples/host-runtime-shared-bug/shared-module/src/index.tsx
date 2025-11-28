import React, { createContext, ReactNode, useContext } from 'react';

interface LayoutContextValue {
  theme: 'light' | 'dark';
  appName: string;
}

const LayoutContext = createContext<LayoutContextValue>({
  theme: 'dark',
  appName: 'Host App',
});

export const useLayoutContext = (): LayoutContextValue => {
  return useContext(LayoutContext);
};

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const styles: React.CSSProperties = {
    padding: '20px',
    border: '2px solid #00d9ff',
    borderRadius: '8px',
    backgroundColor: '#16213e',
    margin: '10px 0',
  };

  return (
    <LayoutContext.Provider value={{ theme: 'dark', appName: 'Host App' }}>
      <div style={styles}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
          📦 Layout component from @my-org/shared-module (provided by host)
        </div>
        {children}
      </div>
    </LayoutContext.Provider>
  );
};

export const SharedButton: React.FC<{ onClick?: () => void; children: ReactNode }> = ({
  onClick,
  children,
}) => {
  const styles: React.CSSProperties = {
    backgroundColor: '#00d9ff',
    color: '#1a1a2e',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  };

  return (
    <button style={styles} onClick={onClick}>
      {children}
    </button>
  );
};
