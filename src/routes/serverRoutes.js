const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const serverController = require('../controllers/serverController');

// All server routes require authentication
router.use(authenticateToken);

// Server management
router.post('/', serverController.createServer);
router.post('/join', serverController.joinServer);
router.get('/', serverController.getUserServers);

// Member management
router.get('/:serverId/members', serverController.getServerMembers);

// Channel management
router.get('/:serverId/channels', serverController.getServerChannels);
router.post('/:serverId/channels', serverController.createChannel);

module.exports = router;