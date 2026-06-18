# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1] - 2026-06-18

First public testing (beta) release.

### Added

- **AI planning agent** — conversational, three-phase workflow (ask → propose → confirm)
  powered by DeepSeek via the Vercel AI SDK. The conversation and the plan data are
  produced by two separate calls so prose and structured output never mix; plans are
  applied as incremental deltas that never touch completed tasks.
- **Plans & chat** — each plan owns its own chat thread; create, rename, and delete plans.
- **My Day** — cross-plan daily view with AI-generated task suggestions.
- **Rich todo editing** — title, priority, due date/time, multi-step checklists, notes,
  and location, edited in a slide-in/bottom-sheet drawer.
- **Drag-to-reorder** — dependency-free pointer-based reordering (mouse + touch),
  persisted per-plan and for the My Day view.
- **Calendar view** — monthly grid and all-tasks list sorted by due date/time.
- **Maps & location** — Google Places autocomplete, embedded map in todo details, and a
  map plotting every located todo with priority-colored pins (optional, requires a
  Google Maps API key).
- **Personal context** — store free-form location/schedule/preferences that tailor every
  AI response and suggestion.
- **Accounts** — email/password authentication (NextAuth v5) with per-user data scoping
  and PostgreSQL persistence.
- **SEO & sharing** — metadata, robots.txt, sitemap, dynamic Open Graph image, and
  Schema.org structured data.
- **Analytics** — optional Matomo tracking and Docker build configuration.

[1.0.0-beta.1]: https://github.com/jishen027/AITodo/releases/tag/v1.0.0-beta.1
