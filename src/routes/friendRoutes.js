const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const friendController = require('../controllers/friendController');

// All friend routes require authentication
router.use(authenticateToken);

// Send friend request
router.post('/request', friendController.sendFriendRequest);

// Accept friend request
router.post('/request/:requestId/accept', friendController.acceptFriendRequest);

// Decline friend request
router.post('/request/:requestId/decline', friendController.declineFriendRequest);

// Get friends list
router.get('/', friendController.getFriends);

// Get friend requests (pending)
router.get('/requests', friendController.getFriendRequests);

// Get pending requests only
router.get('/requests/pending', friendController.getPendingRequests);

// Get friendship status with another user
router.get('/status/:userId', friendController.getFriendshipStatus);

// Remove friend
router.delete('/:friendId', friendController.removeFriend);

module.exports = router;