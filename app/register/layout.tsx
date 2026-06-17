import type { Metadata } from 'next';

// The sign-up page is a legitimate landing target ("free AI todo app"), so it's
// indexable with its own title, description, and canonical.
export const metadata: Metadata = {
  title: 'Create your free account',
  description:
    'Sign up free for AI Todo — the AI task manager that turns your goals into actionable plans in seconds.',
  alternates: { canonical: '/register' },
  robots: { index: true, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
