const { directMessages, generateId } = require('../models');
const { getUserById } = require('./userController');

// Get direct messages between two users
exports.getDirectMessages = (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;
        
        const messages = directMessages.filter(dm => 
            (dm.senderId === currentUserId && dm.recipientId == userId) ||
            (dm.senderId == userId && dm.recipientId === currentUserId)
        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        // Add sender info to messages
        const messagesWithSenders = messages.map(message => {
            const sender = getUserById(message.senderId);
            return {
                ...message,
                username: sender ? sender.username : `User ${message.senderId}`
            };
        });
        
        res.json(messagesWithSenders);
    } catch (error) {
        console.error('Error getting direct messages:', error);
        res.status(500).json({ error: 'Failed to get direct messages' });
    }
};

// Send a direct message
exports.sendDirectMessage = (req, res) => {
    try {
        const { recipientId, text, images } = req.body;
        const senderId = req.userId;
        
        if (!recipientId || !text.trim()) {
            return res.status(400).json({ error: 'Recipient and message text are required' });
        }
        
        const recipient = getUserById(recipientId);
        if (!recipient) {
            return res.status(404).json({ error: 'Recipient not found' });
        }
        
        const sender = getUserById(senderId);
        const message = {
            id: generateId(),
            senderId,
            recipientId: parseInt(recipientId),
            text,
            images: images || [],
            createdAt: new Date(),
            username: sender ? sender.username : `User ${senderId}`
        };
        
        directMessages.push(message);
        
        res.status(201).json({ 
            message: 'Direct message sent',
            data: message
        });
    } catch (error) {
        console.error('Error sending direct message:', error);
        res.status(500).json({ error: 'Failed to send direct message' });
    }
};

// Get list of users with whom current user has DM conversations
exports.getDMConversations = (req, res) => {
    try {
        const currentUserId = req.userId;
        
        const conversationUserIds = new Set();
        
        directMessages.forEach(dm => {
            if (dm.senderId === currentUserId) {
                conversationUserIds.add(dm.recipientId);
            } else if (dm.recipientId === currentUserId) {
                conversationUserIds.add(dm.senderId);
            }
        });
        
        const conversations = Array.from(conversationUserIds).map(userId => {
            const user = getUserById(userId);
            const lastMessage = directMessages
                .filter(dm => 
                    (dm.senderId === currentUserId && dm.recipientId === userId) ||
                    (dm.senderId === userId && dm.recipientId === currentUserId)
                )
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            
            return {
                id: userId,
                username: user ? user.username : `User ${userId}`,
                lastMessage: lastMessage ? lastMessage.text : 'No messages yet',
                lastMessageTime: lastMessage ? lastMessage.createdAt : null
            };
        });
        
        res.json(conversations);
    } catch (error) {
        console.error('Error getting DM conversations:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
};