const { friendRequests, friendships, generateId } = require('../models');
const { getUserById, users } = require('./userController');

exports.sendFriendRequest = (req, res) => {
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
        
        friendRequests.push(friendRequest);
        
        // Send real-time notification to recipient via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to(`user-${targetUser.id}`).emit('friend-request-received', {
                id: friendRequest.id,
                senderUsername: sender.username,
                senderId: senderId,
                message: `${sender.username} sent you a friend request!`
            });
        }
        
        res.status(201).json({ 
            message: `Friend request sent to ${targetUser.username}`,
            request: friendRequest
        });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
};

exports.acceptFriendRequest = (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;
        
        const requestIndex = friendRequests.findIndex(fr => 
            fr.id == requestId && fr.receiverId === userId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Friend request not found' });
        }
        
        const request = friendRequests[requestIndex];
        
        // Create friendship
        const friendship = {
            id: generateId(),
            userId1: request.senderId,
            userId2: request.receiverId,
            createdAt: new Date()
        };
        
        friendships.push(friendship);
        
        // Remove the request
        friendRequests.splice(requestIndex, 1);
        
        res.json({ 
            message: 'Friend request accepted',
            friendship 
        });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
};

exports.declineFriendRequest = (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;
        
        const requestIndex = friendRequests.findIndex(fr => 
            fr.id == requestId && fr.receiverId === userId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Friend request not found' });
        }
        
        friendRequests.splice(requestIndex, 1);
        
        res.json({ message: 'Friend request declined' });
    } catch (error) {
        console.error('Decline friend request error:', error);
        res.status(500).json({ error: 'Failed to decline friend request' });
    }
};

exports.getFriends = (req, res) => {
    try {
        const userId = req.userId;
        
        const userFriendships = friendships.filter(f => 
            f.userId1 === userId || f.userId2 === userId
        );
        
        const friends = userFriendships.map(friendship => {
            const friendId = friendship.userId1 === userId ? friendship.userId2 : friendship.userId1;
            const friend = getUserById(friendId);
            return {
                friendshipId: friendship.id,
                id: friendId,
                username: friend ? friend.username : `User ${friendId}`,
                email: friend ? friend.email : '',
                avatar: friend ? (friend.avatar || null) : null,
                status: 'online', // TODO: implement actual status
                friendsSince: friendship.createdAt
            };
        });
        
        res.json({ friends });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
};

exports.getFriendRequests = (req, res) => {
    try {
        const userId = req.userId;
        
        const incomingRequests = friendRequests.filter(fr => fr.receiverId === userId);
        const outgoingRequests = friendRequests.filter(fr => fr.senderId === userId);
        
        res.json({ 
            incoming: incomingRequests,
            outgoing: outgoingRequests
        });
    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Failed to get friend requests' });
    }
};

exports.removeFriend = (req, res) => {
    try {
        const { friendId } = req.params;
        const userId = req.userId;
        
        const friendshipIndex = friendships.findIndex(f => 
            (f.userId1 === userId && f.userId2 == friendId) ||
            (f.userId1 == friendId && f.userId2 === userId)
        );
        
        if (friendshipIndex === -1) {
            return res.status(404).json({ error: 'Friendship not found' });
        }
        
        friendships.splice(friendshipIndex, 1);
        
        res.json({ message: 'Friend removed' });
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
};

exports.getFriendshipStatus = (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;
        
        if (parseInt(userId) === currentUserId) {
            return res.json({ areFriends: false, pendingRequest: false });
        }
        
        // Check if they are friends
        const friendship = friendships.find(f => 
            (f.userId1 === currentUserId && f.userId2 == userId) ||
            (f.userId1 == userId && f.userId2 === currentUserId)
        );
        
        if (friendship) {
            return res.json({ areFriends: true, pendingRequest: false });
        }
        
        // Check if there's a pending request
        const pendingRequest = friendRequests.find(fr => 
            (fr.senderId === currentUserId && fr.receiverId == userId) ||
            (fr.senderId == userId && fr.receiverId === currentUserId)
        );
        
        res.json({ 
            areFriends: false, 
            pendingRequest: !!pendingRequest 
        });
    } catch (error) {
        console.error('Get friendship status error:', error);
        res.status(500).json({ error: 'Failed to get friendship status' });
    }
};

exports.getPendingRequests = (req, res) => {
    try {
        const userId = req.userId;
        console.log('Getting pending requests for user:', userId);
        console.log('All friend requests:', friendRequests);
        
        const incomingRequests = friendRequests
            .filter(fr => fr.receiverId === userId)
            .map(request => {
                const sender = getUserById(request.senderId);
                return {
                    id: request.id,
                    username: sender ? sender.username : `User ${request.senderId}`,
                    avatar: sender ? (sender.avatar || null) : null,
                    createdAt: request.createdAt
                };
            });
        
        console.log('Filtered incoming requests:', incomingRequests);
        res.json(incomingRequests);
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ error: 'Failed to get pending requests' });
    }
};