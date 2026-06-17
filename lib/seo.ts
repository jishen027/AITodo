// ---------------------------------------------------------------------------
// Central SEO config — shared by the root metadata, robots, sitemap, and the
// JSON-LD structured data so the canonical URL and product copy stay in sync.
// ---------------------------------------------------------------------------

// The production origin. MUST be an absolute URL for Open Graph / canonical tags
// and the sitemap to resolve correctly. Set NEXT_PUBLIC_SITE_URL in production
// (e.g. https://aitodo.app); falls back to localhost for dev.
//
// Note the empty-string guard: a Docker `ARG NEXT_PUBLIC_SITE_URL` that's
// declared but passed no value resolves to "" (not undefined), so `??` wouldn't
// catch it — and `new URL("")` in the root layout's metadataBase throws at build
// time ("Failed to collect page data for /_not-found"). Trim and treat blank as
// unset so an unconfigured build still succeeds with the localhost fallback.
const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
export const SITE_URL = (rawSiteUrl || 'http://localhost:3000').replace(/\/$/, '');

export const SITE_NAME = 'AI Todo';

export const SITE_DESCRIPTION =
  'AI Todo is a free AI-powered task manager and planner. Describe a goal in plain language and the AI breaks it into actionable tasks, due dates, and steps — then adapts your plan as things change.';

// Primary keyword targets, drawn from how people search for this category. Modern
// search engines ignore the <meta keywords> tag for ranking, but keeping the list
// here documents the target terms and feeds the metadata for the few engines and
// internal tools that still read it.
export const SITE_KEYWORDS = [
  'AI todo list',
  'AI task manager',
  'AI planner',
  'AI to-do app',
  'smart task management',
  'AI productivity app',
  'goal planning app',
  'AI daily planner',
  'task breakdown',
  'free todo app',
];

// Routes that should be crawled and indexed (public marketing/auth surfaces).
// Everything under /dashboard, /profile, and /api is private and excluded.
export const PUBLIC_ROUTES = ['/', '/register'] as const;
