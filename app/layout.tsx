import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = {
  // Absolute base so Open Graph images, canonical URLs, and the sitemap resolve.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — AI Task Manager & Planner`,
    // Child pages set their own title; "%s" is slotted in, brand appended.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'productivity',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — AI Task Manager & Planner`,
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — AI Task Manager & Planner`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  // Stops mobile Safari from auto-linking incidental numbers/emails as if they
  // were phone/contact data, which can distort how the page is presented.
  formatDetection: { telephone: false, address: false, email: false },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the token from Google Search
  // Console (Settings → Ownership verification → HTML tag) to verify the site.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366f1',
  // Make the on-screen keyboard shrink the layout viewport instead of
  // overlaying it, so bottom-anchored inputs stay visible while typing.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <Script
          src="https://analytics.promptnotfound.com/script.js"
          data-website-id="4117e5f5-c284-47c0-8644-62241a5371cf"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
