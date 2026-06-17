import type { Metadata } from 'next';

// The dashboard is private, auth-gated app surface — keep it out of search
// indexes so crawlers spend budget on the public marketing pages instead.
export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
