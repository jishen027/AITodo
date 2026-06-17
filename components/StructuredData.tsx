import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo';

// Schema.org JSON-LD for the landing page. Describes the product as a
// WebApplication (so Google can show a rich app result with price/category) plus
// the Organization and WebSite entities, linked via a @graph. Rendered as a
// server-side <script> so it's in the initial HTML that crawlers read.
export default function StructuredData() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        browserRequirements: 'Requires JavaScript. Works in any modern browser.',
        publisher: { '@id': `${SITE_URL}/#organization` },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          'AI-powered task planning from plain-language goals',
          'Automatic task breakdown with due dates and steps',
          'Unified calendar across all plans',
          'My Day daily focus view with AI suggestions',
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; no user input is interpolated.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
