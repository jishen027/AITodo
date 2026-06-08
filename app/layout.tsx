import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Todo',
  description: 'AI-powered task management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
