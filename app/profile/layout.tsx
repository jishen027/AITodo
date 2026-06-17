import type { Metadata } from 'next';

// Private account pages (/profile and /profile/context) — never index.
export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
