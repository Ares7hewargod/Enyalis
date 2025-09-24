const { getPool } = require('../db');

module.exports = {
  async createServer({ name, description = null, icon = null, ownerId }) {
    const pool = getPool();
    const inviteCode = Math.random().toString(36).slice(2, 10);
    const { rows } = await pool.query(
      `INSERT INTO servers(name, description, icon, owner_id, invite_code)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name, description, icon, ownerId, inviteCode]
    );
    return rows[0];
  },
  async addMember({ serverId, userId, role = 'member' }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO server_members(server_id, user_id, role)
       VALUES($1,$2,$3)
       ON CONFLICT (server_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [serverId, userId, role]
    );
    return rows[0];
  },
  async getServersForUser(userId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT s.*, m.role, m.joined_at FROM servers s
         JOIN server_members m ON m.server_id = s.id
        WHERE m.user_id = $1
        ORDER BY s.created_at ASC`,
      [userId]
    );
    return rows;
  },
  async getServerById(id) {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM servers WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async updateServer(id, { name, description, icon, settings }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE servers SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        icon = COALESCE($4, icon),
        settings = COALESCE($5, settings)
       WHERE id = $1 RETURNING *`,
      [id, name, description, icon, settings]
    );
    return rows[0] || null;
  },
  async getMembers(serverId) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT m.*, u.username, u.avatar FROM server_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.server_id = $1
        ORDER BY m.joined_at ASC`,
      [serverId]
    );
    return rows;
  }
};
