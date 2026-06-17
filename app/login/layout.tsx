import type { Metadata } from 'next';

// A bare sign-in form is thin, duplicate-ish content — give it a clear title but
// keep it out of the index (links are still followed).
export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your AI Todo account.',
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
