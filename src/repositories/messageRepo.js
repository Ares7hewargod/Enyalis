const { getPool } = require('../db');

module.exports = {
  async createChannelMessage({ channelId, userId, content }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO channel_messages(channel_id, user_id, content)
       VALUES($1,$2,$3) RETURNING *`,
      [channelId, userId, content]
    );
    return rows[0];
  },
  async getRecentChannelMessages({ channelId, limit = 50, beforeId = null }) {
    const pool = getPool();
    if (beforeId) {
      const { rows } = await pool.query(
        `SELECT * FROM channel_messages
          WHERE channel_id = $1 AND id < $2
          ORDER BY id DESC
          LIMIT $3`,
        [channelId, beforeId, limit]
      );
      return rows.reverse();
    }
    const { rows } = await pool.query(
      `SELECT * FROM channel_messages
        WHERE channel_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [channelId, limit]
    );
    return rows.reverse();
  },
  async createDirectMessage({ senderId, recipientId, content }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO direct_messages(sender_id, recipient_id, content)
       VALUES($1,$2,$3) RETURNING *`,
      [senderId, recipientId, content]
    );
    return rows[0];
  },
  async getRecentDirectMessages({ userA, userB, limit = 50, beforeId = null }) {
    const pool = getPool();
    try {
      if (beforeId) {
        const { rows } = await pool.query(
          `SELECT * FROM direct_messages
             WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
               AND id < $3
             ORDER BY id DESC
             LIMIT $4`,
          [userA, userB, beforeId, limit]
        );
        return rows.reverse();
      }
      const { rows } = await pool.query(
        `SELECT * FROM direct_messages
           WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
           ORDER BY id DESC
           LIMIT $3`,
        [userA, userB, limit]
      );
      return rows.reverse();
    } catch (err) {
      console.error('[messageRepo.getRecentDirectMessages] error', { userA, userB, beforeId, limit, code: err.code, message: err.message });
      throw err;
    }
  }
  ,async updateChannelMessage({ messageId, userId, content }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE channel_messages
         SET content = $3, edited = TRUE, edited_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted = FALSE
       RETURNING *`,
      [messageId, userId, content]
    );
    return rows[0] || null;
  }
  ,async softDeleteChannelMessage({ messageId, userId }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE channel_messages
         SET deleted = TRUE, edited = FALSE, edited_at = NULL
       WHERE id = $1 AND user_id = $2 AND deleted = FALSE
       RETURNING *`,
      [messageId, userId]
    );
    return rows[0] || null;
  }
  ,async updateDirectMessage({ messageId, userId, content }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE direct_messages
         SET content = $3, edited = TRUE, edited_at = NOW()
       WHERE id = $1 AND sender_id = $2 AND deleted = FALSE
       RETURNING *`,
      [messageId, userId, content]
    );
    return rows[0] || null;
  }
  ,async softDeleteDirectMessage({ messageId, userId }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE direct_messages
         SET deleted = TRUE, edited = FALSE, edited_at = NULL
       WHERE id = $1 AND sender_id = $2 AND deleted = FALSE
       RETURNING *`,
      [messageId, userId]
    );
    return rows[0] || null;
  }
};
