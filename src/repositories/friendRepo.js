const { getPool } = require('../db');

module.exports = {
  async sendRequest({ senderId, receiverId }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO friend_requests(sender_id, receiver_id)
       VALUES($1,$2) RETURNING *`,
      [senderId, receiverId]
    );
    return rows[0];
  },
  async acceptRequest(id) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: reqRows } = await client.query('SELECT * FROM friend_requests WHERE id = $1 AND status = \'pending\'', [id]);
      const req = reqRows[0];
      if (!req) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('UPDATE friend_requests SET status = \'accepted\' WHERE id = $1', [id]);
      const u1 = Math.min(req.sender_id, req.receiver_id);
      const u2 = Math.max(req.sender_id, req.receiver_id);
      await client.query(
        `INSERT INTO friendships(user_id1, user_id2)
         VALUES($1,$2)
         ON CONFLICT (user_id1, user_id2) DO NOTHING`,
        [u1, u2]
      );
      await client.query('COMMIT');
      return req;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
  async rejectRequest(id) {
    const pool = getPool();
    await pool.query('UPDATE friend_requests SET status = \'rejected\' WHERE id = $1', [id]);
  },
  async listRequests(userId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT fr.*, u.username as sender_username, u.avatar as sender_avatar
         FROM friend_requests fr
         JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = $1 AND fr.status = 'pending'
        ORDER BY fr.created_at DESC`,
      [userId]
    );
    return rows;
  },
  async listFriends(userId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT f.*, u.id as friend_id, u.username, u.avatar
         FROM friendships f
         JOIN users u ON (u.id = CASE WHEN f.user_id1 = $1 THEN f.user_id2 ELSE f.user_id1 END)
        WHERE f.user_id1 = $1 OR f.user_id2 = $1
        ORDER BY f.created_at DESC`,
      [userId]
    );
    return rows;
  },
  async areFriends(a, b) {
    const pool = getPool();
    const u1 = Math.min(a, b);
    const u2 = Math.max(a, b);
    const { rows } = await pool.query(
      'SELECT 1 FROM friendships WHERE user_id1 = $1 AND user_id2 = $2 LIMIT 1',
      [u1, u2]
    );
    return rows.length > 0;
  },
  async hasPendingRequest(senderId, receiverId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT 1 FROM friend_requests
        WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending' LIMIT 1`,
      [senderId, receiverId]
    );
    return rows.length > 0;
  }
};
