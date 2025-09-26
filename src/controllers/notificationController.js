const { getPool } = require('../db');

// GET /api/notifications/summary
// Returns unread counts per server and channel, and mention counts
async function getSummary(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const pool = getPool();

    // Aggregate unread by server/channel and mentions separately
    const { rows } = await pool.query(
      `SELECT server_id, channel_id,
              SUM(CASE WHEN type = 'message' AND read = false THEN 1 ELSE 0 END) AS unread_messages,
              SUM(CASE WHEN type = 'mention' AND read = false THEN 1 ELSE 0 END) AS unread_mentions
         FROM notifications
        WHERE user_id = $1
        GROUP BY server_id, channel_id
        ORDER BY server_id, channel_id` , [userId]
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('getSummary error', e);
    res.status(500).json({ error: 'Failed to load summary' });
  }
}

// POST /api/channels/:channelId/read
// Marks notifications up to latest message as read for this channel
async function markChannelRead(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const channelId = parseFloat(req.params.channelId);
    if (!channelId) return res.status(400).json({ error: 'Invalid channel id' });
    const pool = getPool();
    const { rowCount } = await pool.query(
      `UPDATE notifications SET read = true
         WHERE user_id = $1 AND channel_id = $2 AND read = false`,
      [userId, channelId]
    );

    // Notify client to clear badges for this channel
    try {
      const io = req.app.get('io');
      if (io) io.to(`user-${userId}`).emit('channel-read', { channelId });
    } catch {}

    res.json({ ok: true, updated: rowCount });
  } catch (e) {
    console.error('markChannelRead error', e);
    res.status(500).json({ error: 'Failed to mark read' });
  }
}

module.exports = { getSummary, markChannelRead };
