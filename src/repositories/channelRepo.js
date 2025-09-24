const { getPool } = require('../db');

module.exports = {
  async createChannel({ serverId, name, type = 'text', topic = null, position = 0 }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO channels(server_id, name, type, topic, position)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [serverId, name, type, topic, position]
    );
    const r = rows[0];
    return {
      id: r.id,
      serverId: r.server_id,
      name: r.name,
      type: r.type,
      position: r.position,
      topic: r.topic,
      createdAt: r.created_at
    };
  },
  async getChannels(serverId) {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC, id ASC`, [serverId]);
    return rows.map(r => ({
      id: r.id,
      serverId: r.server_id,
      name: r.name,
      type: r.type,
      position: r.position,
      topic: r.topic,
      createdAt: r.created_at
    }));
  },
  async getChannel(id) {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM channels WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      type: row.type,
      position: row.position,
      topic: row.topic,
      createdAt: row.created_at
    };
  }
};
