import { Pool } from 'pg';

declare global {
  var _pgPool: Pool | undefined; // global singleton to survive hot-reloads in dev
}

export const pool =
  global._pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') {
  global._pgPool = pool;
}

// Lazy schema init — runs once per server process
let _ready: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!_ready) _ready = createSchema();
  return _ready;
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          VARCHAR(50)  PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      email       VARCHAR(255) UNIQUE NOT NULL,
      password    VARCHAR(255),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS plans (
      id          VARCHAR(50)  PRIMARY KEY,
      title       TEXT         NOT NULL,
      user_id     VARCHAR(50)  REFERENCES users(id) ON DELETE CASCADE,
      is_my_day   BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS todos (
      id          VARCHAR(50)  PRIMARY KEY,
      plan_id     VARCHAR(50)  NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      text        TEXT         NOT NULL,
      completed   BOOLEAN      NOT NULL DEFAULT FALSE,
      notes       TEXT         NOT NULL DEFAULT '',
      due_date    VARCHAR(10)  NOT NULL DEFAULT '',
      due_time    VARCHAR(5)   NOT NULL DEFAULT '',
      priority    VARCHAR(10)  NOT NULL DEFAULT 'none',
      location     TEXT             NOT NULL DEFAULT '',
      location_lat DOUBLE PRECISION,
      location_lng DOUBLE PRECISION,
      my_day      BOOLEAN      NOT NULL DEFAULT FALSE,
      sort_order  INTEGER      NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS steps (
      id          VARCHAR(50)  PRIMARY KEY,
      todo_id     VARCHAR(50)  NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      text        TEXT         NOT NULL,
      completed   BOOLEAN      NOT NULL DEFAULT FALSE,
      sort_order  INTEGER      NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id          SERIAL       PRIMARY KEY,
      plan_id     VARCHAR(50)  NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      role        VARCHAR(10)  NOT NULL CHECK (role IN ('ai', 'user')),
      text        TEXT         NOT NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  // Safe migrations
  await pool.query(`
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE;
  `);
  // Allow existing credential users to remain unchanged; Google users have no password
  await pool.query(`
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
  `);
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS my_day BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_my_day BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  // When a task was completed — used to show "completed today" in My Day.
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `);
  // User-defined ordering of tasks within the My Day view (which spans plans, so
  // the per-plan sort_order can't express it). Reordering My Day writes this.
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS my_day_order INTEGER NOT NULL DEFAULT 0;
  `);
  // User-specific context (address, personal details, preferences) fed to the AI
  // assistant so it can tailor generated plans.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_context TEXT NOT NULL DEFAULT '';
  `);
}
