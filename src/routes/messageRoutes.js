const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

// All message routes require authentication
router.use(authenticateToken);

router.post('/', messageController.uploadMiddleware, messageController.sendMessage);
router.get('/channel/:channelId', messageController.getMessagesByChannel);
router.get('/dm/:userId', messageController.getDirectMessages);
router.get('/conversations', messageController.getDMConversations);
router.put('/:scope/:id', messageController.editMessage); // scope: channel|dm
router.delete('/:scope/:id', messageController.deleteMessage);

module.exports = router;
