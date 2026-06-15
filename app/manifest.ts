import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI Todo',
    short_name: 'AI Todo',
    description: 'AI-powered task management',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6366f1',
    icons: [
      // Android home-screen / install icons. 192 + 512 are the sizes Chrome
      // looks for; declared sizes must match the actual files or Chrome falls
      // back to a generic icon.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate maskable icon with safe-zone padding so Android's adaptive
      // mask doesn't clip the checkmark.
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
