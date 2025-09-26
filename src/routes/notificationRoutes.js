const express = require('express');
const router = express.Router();
const { getSummary, markChannelRead } = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

router.get('/summary', authenticateToken, getSummary);
router.post('/channels/:channelId/read', authenticateToken, markChannelRead);

module.exports = router;
