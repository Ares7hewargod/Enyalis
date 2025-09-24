const { Pool } = require('pg');
const { flushUsers } = require('./dbBuffer');

// Toggle DB usage (set USE_DB=0 to disable, default on if pg installed and env vars present)
const USE_DB = !['0', 'false', 'no'].includes(String(process.env.USE_DB || 'true').toLowerCase());
const REQUIRE_DB = ['1', 'true', 'yes'].includes(String(process.env.REQUIRE_DB || 'false').toLowerCase());

let pool = null;
let lastDbOk = false;

if (USE_DB) {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'enyalis',
    password: process.env.DB_PASSWORD || 'enyalis_password',
    database: process.env.DB_NAME || 'enyalis_db'
  });
}

async function init() {
  if (!USE_DB) {
    console.log('[DB] Disabled (USE_DB set to false) – using in-memory only');
    return false;
  }
  if (!pool) {
    console.log('[DB] Pool not initialized – skipping');
    return false;
  }
  try {
    // Simple connectivity test
    const client = await pool.connect();
    client.release();
    // Wrap schema creation in a single transaction so partial failures don't leave us in an odd state
    await pool.query('BEGIN');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        avatar TEXT,
        banner TEXT,
        bio TEXT DEFAULT '',
        status VARCHAR(16) DEFAULT 'online',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Core server/guild tables (servers must exist before server_roles references it)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS servers (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon TEXT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_code VARCHAR(16) UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        settings JSONB DEFAULT '{}'::jsonb
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS server_roles (
        id BIGSERIAL PRIMARY KEY,
        server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(16) DEFAULT '#dcddde',
        permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
        position INTEGER NOT NULL DEFAULT 0,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(server_id, name)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS server_members (
        id BIGSERIAL PRIMARY KEY,
        server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(16) DEFAULT 'member',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(server_id, user_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id BIGSERIAL PRIMARY KEY,
        server_id BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(16) NOT NULL DEFAULT 'text',
        position INTEGER NOT NULL DEFAULT 0,
        topic TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(server_id, name)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_messages (
        id BIGSERIAL PRIMARY KEY,
        channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL DEFAULT '',
        edited BOOLEAN DEFAULT false,
        edited_at TIMESTAMPTZ,
        deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS channel_messages_channel_created_idx ON channel_messages(channel_id, created_at DESC, id DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id BIGSERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        edited BOOLEAN DEFAULT false,
        edited_at TIMESTAMPTZ,
        deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS direct_messages_pair_idx ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC, id DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id BIGSERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id BIGSERIAL PRIMARY KEY,
        user_id1 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id2 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id1, user_id2)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id BIGSERIAL PRIMARY KEY,
        channel_message_id BIGINT REFERENCES channel_messages(id) ON DELETE CASCADE,
        direct_message_id BIGINT REFERENCES direct_messages(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CHECK ((channel_message_id IS NOT NULL AND direct_message_id IS NULL) OR (channel_message_id IS NULL AND direct_message_id IS NOT NULL))
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS message_attachments_channel_idx ON message_attachments(channel_message_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS message_attachments_dm_idx ON message_attachments(direct_message_id);
    `);
    await pool.query('COMMIT');
    console.log('[DB] Users table ensured');
    if (!lastDbOk) {
      lastDbOk = true;
      // Attempt flush of any buffered writes
      flushUsers(pool).then(r => {
        if (r.flushed || r.conflicts || r.errors) {
          console.log(`[DB] Flush summary after reconnect:`, r);
        }
      }).catch(e => console.warn('[DB] Flush error after reconnect:', e.message));
    }
    return true;
  } catch (err) {
    try { await pool.query('ROLLBACK'); } catch (_) {}
    if (REQUIRE_DB) {
      console.error('[DB] REQUIRED database connection failed. Exiting. Reason:', err.code || err.message);
      process.exit(1);
    } else {
      console.warn('[DB] Connection failed – falling back to in-memory. Reason:', err.code || err.message);
      if (pool) pool.disabled = true; // flag for controllers
      return false;
    }
  }
}

// Heartbeat to detect DB recovery when not active
if (USE_DB) {
  setInterval(async () => {
    if (!pool || pool.disabled) return; // disabled means we fell back
    try {
      await pool.query('SELECT 1');
      if (!lastDbOk) {
        lastDbOk = true;
        console.log('[DB] Connectivity restored (heartbeat)');
        flushUsers(pool).then(r => {
          if (r.flushed || r.conflicts || r.errors) {
            console.log('[DB] Flush summary (heartbeat):', r);
          }
        });
      }
    } catch (e) {
      if (lastDbOk) console.warn('[DB] Lost connectivity:', e.code || e.message);
      lastDbOk = false;
    }
  }, 10000).unref();
}

function isActive() {
  return !!(pool && !pool.disabled && USE_DB);
}

function getPool() { return pool; }

module.exports = { pool, getPool, init, isActive, USE_DB, REQUIRE_DB };
