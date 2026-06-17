import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

// Dynamically generated 1200×630 social-share card. Next.js wires this file up as
// the og:image automatically (and twitter-image.tsx re-exports it), so every
// shared link gets a branded preview without shipping a static asset.
export const alt = `${SITE_NAME} — AI Task Manager & Planner`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 55%)',
          padding: 80,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#6366f1',
              color: '#ffffff',
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            AI
          </div>
          <span style={{ fontSize: 36, fontWeight: 700, color: '#111827' }}>{SITE_NAME}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: '#6366f1',
              background: '#eef2ff',
              borderRadius: 999,
              padding: '8px 24px',
              alignSelf: 'flex-start',
            }}
          >
            AI-powered task management
          </span>
          <span style={{ fontSize: 76, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
            Plan smarter.
          </span>
          <span style={{ fontSize: 76, fontWeight: 800, color: '#6366f1', lineHeight: 1.1, marginTop: -24 }}>
            Get more done.
          </span>
          <span style={{ fontSize: 32, color: '#6b7280', maxWidth: 900 }}>
            Describe a goal and the AI builds your plan, tracks progress, and adapts as things change.
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
