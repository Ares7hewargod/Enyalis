const { getPool } = require('../db');

module.exports = {
  async ensureDefaultRole(serverId) {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id FROM server_roles WHERE server_id = $1 AND is_default = true LIMIT 1',
      [serverId]
    );
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO server_roles(server_id, name, color, permissions, position, is_default)
         VALUES($1,'@everyone','#dcddde', ARRAY[]::text[], 0, true)`,
        [serverId]
      );
    }
  },
  async listRoles(serverId) {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM server_roles WHERE server_id = $1 ORDER BY position ASC, id ASC',
      [serverId]
    );
    return rows;
  },
  async createRole(serverId, { name, color = '#5865f2', permissions = [], position }) {
    const pool = getPool();
    if (position == null) {
      const { rows: posRows } = await pool.query(
        'SELECT COALESCE(MAX(position),0) + 1 AS next FROM server_roles WHERE server_id = $1',
        [serverId]
      );
      position = posRows[0].next;
    }
    const { rows } = await pool.query(
      `INSERT INTO server_roles(server_id, name, color, permissions, position, is_default)
       VALUES($1,$2,$3,$4,$5,false) RETURNING *`,
      [serverId, name, color, permissions, position]
    );
    return rows[0];
  },
  async updateRole(serverId, roleId, { name, color, permissions, position }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE server_roles SET
        name = COALESCE($3, name),
        color = COALESCE($4, color),
        permissions = COALESCE($5, permissions),
        position = COALESCE($6, position)
       WHERE id = $2 AND server_id = $1 AND is_default = false
       RETURNING *`,
      [serverId, roleId, name, color, permissions, position]
    );
    return rows[0] || null;
  },
  async deleteRole(serverId, roleId) {
    const pool = getPool();
    const { rowCount } = await pool.query(
      'DELETE FROM server_roles WHERE server_id = $1 AND id = $2 AND is_default = false',
      [serverId, roleId]
    );
    return rowCount > 0;
  }
};
