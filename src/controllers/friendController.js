const { friendRequests, friendships, generateId } = require('../models');
const { getUserById, users } = require('./userController');
const { USE_DB } = process.env;
let friendRepo;
try { friendRepo = require('../repositories/friendRepo'); } catch (e) { console.warn('friendRepo not loaded', e.message); }

exports.sendFriendRequest = async (req, res) => {
    try {
        const { username, email, toUserId } = req.body;
        const senderId = req.userId;
        
        let targetUser;
        
        // Find the target user by ID, username, or email
        if (toUserId) {
            targetUser = getUserById(toUserId);
        } else {
            targetUser = users.find(u => 
                u.username.toLowerCase() === username?.toLowerCase() || 
                u.email.toLowerCase() === email?.toLowerCase()
            );
        }
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (targetUser.id === senderId) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' });
        }
        
        // Check if already friends
        const existingFriendship = friendships.find(f => 
            (f.userId1 === senderId && f.userId2 === targetUser.id) ||
            (f.userId1 === targetUser.id && f.userId2 === senderId)
        );
        
        if (existingFriendship) {
            return res.status(400).json({ error: 'Already friends with this user' });
        }
        
        // Check if request already exists
        const existingRequest = friendRequests.find(fr => 
            (fr.senderId === senderId && fr.receiverId === targetUser.id) ||
            (fr.senderId === targetUser.id && fr.receiverId === senderId)
        );
        
        if (existingRequest) {
            return res.status(400).json({ error: 'Friend request already exists' });
        }
        
        const sender = getUserById(senderId);
        const friendRequest = {
            id: generateId(),
            senderId,
            receiverId: targetUser.id,
            senderUsername: sender.username,
            receiverUsername: targetUser.username,
            status: 'pending',
            createdAt: new Date()
        };
        
        if (USE_DB === 'true' && friendRepo) {
            // DB checks
            const areAlready = await friendRepo.areFriends(senderId, targetUser.id);
            if (areAlready) return res.status(400).json({ error: 'Already friends with this user' });
            const pending = await friendRepo.hasPendingRequest(senderId, targetUser.id);
            if (pending) return res.status(400).json({ error: 'Friend request already exists' });
            const created = await friendRepo.sendRequest({ senderId, receiverId: targetUser.id });
            const io = req.app.get('io');
            if (io) {
                io.to(`user-${targetUser.id}`).emit('friend-request-received', {
                    id: created.id,
                    senderUsername: sender.username,
                    senderId: senderId,
                    message: `${sender.username} sent you a friend request!`
                });
            }
            return res.status(201).json({ message: `Friend request sent to ${targetUser.username}`, request: created });
        }
        friendRequests.push(friendRequest);
        const io = req.app.get('io');
        if (io) io.to(`user-${targetUser.id}`).emit('friend-request-received', { id: friendRequest.id, senderUsername: sender.username, senderId, message: `${sender.username} sent you a friend request!` });
        res.status(201).json({ message: `Friend request sent to ${targetUser.username}`, request: friendRequest });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
};

exports.acceptFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;
        if (USE_DB === 'true' && friendRepo) {
            const accepted = await friendRepo.acceptRequest(requestId);
            if (!accepted) return res.status(404).json({ error: 'Friend request not found' });
            return res.json({ message: 'Friend request accepted', friendship: accepted });
        }
        const requestIndex = friendRequests.findIndex(fr => fr.id == requestId && fr.receiverId === userId);
        if (requestIndex === -1) return res.status(404).json({ error: 'Friend request not found' });
        const request = friendRequests[requestIndex];
        const friendship = { id: generateId(), userId1: request.senderId, userId2: request.receiverId, createdAt: new Date() };
        friendships.push(friendship);
        friendRequests.splice(requestIndex, 1);
        res.json({ message: 'Friend request accepted (memory)', friendship });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
};

exports.declineFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;
        if (USE_DB === 'true' && friendRepo) {
            // Soft reject in DB
            const { getPool } = require('../db');
            const pool = require('../db').getPool();
            const result = await pool.query('UPDATE friend_requests SET status = \'rejected\' WHERE id = $1 AND receiver_id = $2 RETURNING id', [requestId, userId]);
            if (!result.rows.length) return res.status(404).json({ error: 'Friend request not found' });
            return res.json({ message: 'Friend request declined' });
        }
        const requestIndex = friendRequests.findIndex(fr => fr.id == requestId && fr.receiverId === userId);
        if (requestIndex === -1) return res.status(404).json({ error: 'Friend request not found' });
        friendRequests.splice(requestIndex, 1);
        res.json({ message: 'Friend request declined' });
    } catch (error) {
        console.error('Decline friend request error:', error);
        res.status(500).json({ error: 'Failed to decline friend request' });
    }
};

exports.getFriends = async (req, res) => {
    try {
        const userId = req.userId;
        if (USE_DB === 'true' && friendRepo) {
            const list = await friendRepo.listFriends(userId);
            const friends = list.map(r => ({
                friendshipId: r.id,
                id: r.friend_id,
                username: r.username,
                avatar: r.avatar,
                status: 'online',
                friendsSince: r.created_at
            }));
            return res.json({ friends });
        }
        const userFriendships = friendships.filter(f => f.userId1 === userId || f.userId2 === userId);
        const friends = userFriendships.map(f => { const friendId = f.userId1===userId?f.userId2:f.userId1; const friend = getUserById(friendId); return { friendshipId: f.id, id: friendId, username: friend?friend.username:`User ${friendId}`, email: friend?friend.email:'', avatar: friend?(friend.avatar||null):null, status:'online', friendsSince: f.createdAt }; });
        res.json({ friends });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
};

exports.getFriendRequests = async (req, res) => {
    try {
        const userId = req.userId;
        if (USE_DB === 'true' && friendRepo) {
            const incoming = await friendRepo.listRequests(userId);
            // For outgoing, quick query
            const { getPool } = require('../db');
            const pool = getPool();
            const { rows: outRows } = await pool.query(`SELECT fr.*, u.username as receiver_username FROM friend_requests fr JOIN users u ON u.id = fr.receiver_id WHERE fr.sender_id = $1 AND fr.status = 'pending' ORDER BY fr.created_at DESC`, [userId]);
            return res.json({ incoming, outgoing: outRows });
        }
        const incomingRequests = friendRequests.filter(fr => fr.receiverId === userId);
        const outgoingRequests = friendRequests.filter(fr => fr.senderId === userId);
        res.json({ incoming: incomingRequests, outgoing: outgoingRequests });
    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Failed to get friend requests' });
    }
};

exports.removeFriend = async (req, res) => {
    try {
        const { friendId } = req.params;
        const userId = req.userId;
        if (USE_DB === 'true') {
            const { getPool } = require('../db');
            const pool = getPool();
            const u1 = Math.min(userId, parseInt(friendId));
            const u2 = Math.max(userId, parseInt(friendId));
            const { rowCount } = await pool.query('DELETE FROM friendships WHERE user_id1 = $1 AND user_id2 = $2', [u1, u2]);
            if (!rowCount) return res.status(404).json({ error: 'Friendship not found' });
            return res.json({ message: 'Friend removed' });
        }
        const idx = friendships.findIndex(f => (f.userId1 === userId && f.userId2 == friendId) || (f.userId1 == friendId && f.userId2 === userId));
        if (idx === -1) return res.status(404).json({ error: 'Friendship not found' });
        friendships.splice(idx,1);
        res.json({ message: 'Friend removed' });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
};

exports.getFriendshipStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;
        
        if (parseInt(userId) === currentUserId) {
            return res.json({ areFriends: false, pendingRequest: false });
        }
        
        if (USE_DB === 'true') {
            const targetId = parseInt(userId);
            const areFriends = await friendRepo.areFriends(currentUserId, targetId);
            if (areFriends) return res.json({ areFriends: true, pendingRequest: false });
            const pending = await friendRepo.hasPendingRequest(currentUserId, targetId) || await friendRepo.hasPendingRequest(targetId, currentUserId);
            return res.json({ areFriends: false, pendingRequest: pending });
        }
        const friendship = friendships.find(f => (f.userId1 === currentUserId && f.userId2 == userId) || (f.userId1 == userId && f.userId2 === currentUserId));
        if (friendship) return res.json({ areFriends: true, pendingRequest: false });
        const pendingRequest = friendRequests.find(fr => (fr.senderId === currentUserId && fr.receiverId == userId) || (fr.senderId == userId && fr.receiverId === currentUserId));
        res.json({ areFriends: false, pendingRequest: !!pendingRequest });
    } catch (error) {
        console.error('Get friendship status error:', error);
        res.status(500).json({ error: 'Failed to get friendship status' });
    }
};

exports.getPendingRequests = async (req, res) => {
    try {
        const userId = req.userId;
        if (USE_DB === 'true' && friendRepo) {
            const incoming = await friendRepo.listRequests(userId);
            const simplified = incoming.map(r => ({ id: r.id, username: r.sender_username, avatar: r.sender_avatar, createdAt: r.created_at }));
            return res.json(simplified);
        }
        const incomingRequests = friendRequests.filter(fr => fr.receiverId === userId).map(request => { const sender = getUserById(request.senderId); return { id: request.id, username: sender?sender.username:`User ${request.senderId}`, avatar: sender?(sender.avatar||null):null, createdAt: request.createdAt }; });
        res.json(incomingRequests);
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ error: 'Failed to get pending requests' });
    }
};