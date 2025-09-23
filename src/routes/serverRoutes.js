const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const serverController = require('../controllers/serverController');

// All server routes require authentication
router.use(authenticateToken);

// Server management
// Preview a server by invite code (no membership required besides auth)
router.get('/preview/:inviteCode', serverController.previewByInvite);
router.post('/', serverController.createServer);
router.post('/join', serverController.joinServer);
router.get('/', serverController.getUserServers);
router.put('/:serverId', serverController.updateServer);
router.delete('/:serverId', serverController.deleteServer);

// Member management
router.get('/:serverId/members', serverController.getServerMembers);

// Channel management
router.get('/:serverId/channels', serverController.getServerChannels);
router.post('/:serverId/channels', serverController.createChannel);

// Role management
router.get('/:serverId/roles', serverController.getServerRoles);
router.post('/:serverId/roles', serverController.createRole);
router.put('/:serverId/roles/:roleId', serverController.updateRole);
router.delete('/:serverId/roles/:roleId', serverController.deleteRole);

// Member role management
router.put('/:serverId/members/:userId/role', serverController.updateMemberRole);
router.delete('/:serverId/members/:userId', serverController.kickMember);

module.exports = router;