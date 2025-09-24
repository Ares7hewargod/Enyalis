// Simple in-memory write buffer for periods when the database is unavailable.
// Currently supports buffering new user registrations and flushing them later.
// NOTE: This is a lightweight approach and does not guarantee durability across process restarts.

const pendingUsers = []; // { userObj }

function bufferNewUser(user) {
  // Mark user as pending so controllers / UI could treat differently if needed
  user.__pending = true;
  pendingUsers.push(user);
}

function getPendingUsers() {
  return pendingUsers.slice();
}

function removePendingUser(user) {
  const idx = pendingUsers.indexOf(user);
  if (idx !== -1) pendingUsers.splice(idx, 1);
}

async function flushUsers(pool) {
  if (!pool || pendingUsers.length === 0) return { flushed: 0, conflicts: 0, errors: 0 };

  let flushed = 0, conflicts = 0, errors = 0;
  for (const user of [...pendingUsers]) {
    try {
      // Check if username OR email already exists (could have been inserted after buffering began)
      const exists = await pool.query('SELECT id FROM users WHERE username=$1 OR email=$2 LIMIT 1', [user.username, user.email]);
      if (exists.rowCount > 0) {
        // Conflict: keep first; mark this buffer entry as conflict and drop it
        user.__pending = false; // Not pending anymore, but not inserted (duplicate)
        user.__conflict = true;
        removePendingUser(user);
        conflicts++;
        continue;
      }
      const insert = await pool.query(
        'INSERT INTO users (username, email, password, avatar, banner, bio, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at',
        [user.username, user.email, user.password, user.avatar || null, user.banner || null, user.bio || '', user.status || 'online']
      );
      user.id = insert.rows[0].id; // ensure DB authoritative ID if you later expand
      user.createdAt = insert.rows[0].created_at;
      user.__pending = false;
      removePendingUser(user);
      flushed++;
    } catch (err) {
      errors++;
      user.__lastFlushError = err.code || err.message;
      // Leave in buffer for retry
    }
  }
  return { flushed, conflicts, errors };
}

module.exports = { bufferNewUser, getPendingUsers, flushUsers };
