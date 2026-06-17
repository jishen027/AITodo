import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Served at /robots.txt. Lets crawlers index the public marketing/auth surfaces
// while keeping private app routes and API endpoints out of the index, and
// advertises the sitemap so search engines can discover every public URL.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/profile', '/api/', '/login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
