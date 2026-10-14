import type { CSSProperties, ReactNode } from 'react';

const wrap: CSSProperties = {
  maxWidth: '28rem',
  margin: 'var(--spacing-xl) auto',
  padding: 'var(--spacing-lg)',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div style={wrap}>{children}</div>;
}
