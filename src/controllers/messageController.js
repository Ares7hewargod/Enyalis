const { messages, directMessages, channels, serverMembers, generateId } = require('../models');
const { getUserById } = require('./userController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

exports.uploadMiddleware = upload.array('images', 5); // Allow up to 5 images

exports.sendMessage = (req, res) => {
    try {
        const { channelId, recipientId, text, type } = req.body;
        const userId = req.userId; // From auth middleware
        const uploadedFiles = req.files || [];
        
        // Get user info
        const user = getUserById(userId);
        const username = user ? user.username : `User ${userId}`;
        
        // Process attachments
        const attachments = uploadedFiles.map(file => ({
            id: generateId(),
            filename: file.originalname,
            url: `/uploads/${file.filename}`,
            size: file.size,
            type: 'image',
            mimetype: file.mimetype
        }));
        
        if (type === 'dm' && recipientId) {
            // Send direct message
            const recipient = getUserById(recipientId);
            if (!recipient) {
                return res.status(404).json({ error: 'Recipient not found' });
            }
            
            const message = {
                id: generateId(),
                senderId: userId,
                recipientId: parseInt(recipientId),
                text: text || '',
                attachments,
                createdAt: new Date(),
                username
            };
            
            directMessages.push(message);
            
            // Broadcast to recipient via WebSocket
            const io = req.app.get('io');
            io.to(`user-${recipientId}`).emit('new-direct-message', message);
            io.to(`user-${userId}`).emit('new-direct-message', message);
            
            res.status(201).json(message);
        } else if (type === 'channel' && channelId) {
            // Send channel message
            const channel = channels.find(c => c.id == channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            // Check if user is member of the server
            const membership = serverMembers.find(m => 
                m.serverId === channel.serverId && m.userId === userId
            );
            
            if (!membership) {
                return res.status(403).json({ error: 'You do not have access to this channel' });
            }
            
            const message = { 
                id: generateId(),
                channelId: parseInt(channelId),
                userId,
                username,
                content: text || '',
                attachments,
                timestamp: new Date(),
                edited: false,
                editedAt: null
            };
            
            messages.push(message);
            
            // Broadcast to all users in the channel via WebSocket
            const io = req.app.get('io');
            io.to(`channel-${channelId}`).emit('new-message', message);
            
            res.status(201).json(message);
        } else {
            return res.status(400).json({ error: 'Invalid message type or missing parameters' });
        }
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

exports.getMessagesByChannel = (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.userId;
        
        // Verify user has access to this channel
        const channel = channels.find(c => c.id == channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        // Check if user is member of the server
        const membership = serverMembers.find(m => 
            m.serverId === channel.serverId && m.userId === userId
        );
        
        if (!membership) {
            return res.status(403).json({ error: 'You do not have access to this channel' });
        }

        const channelMessages = messages
            .filter(m => m.channelId == channelId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Ensure all messages have username info
        const messagesWithUsernames = channelMessages.map(message => {
            if (!message.username) {
                const user = getUserById(message.userId);
                message.username = user ? user.username : `User ${message.userId}`;
            }
            return message;
        });
        
        res.json({ messages: messagesWithUsernames });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
};

// Get direct messages between current user and another user
exports.getDirectMessages = (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;
        
        const userMessages = directMessages.filter(dm => 
            (dm.senderId === currentUserId && dm.recipientId == userId) ||
            (dm.senderId == userId && dm.recipientId === currentUserId)
        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        // Ensure all messages have sender info
        const messagesWithSenders = userMessages.map(message => {
            if (!message.username) {
                const sender = getUserById(message.senderId);
                message.username = sender ? sender.username : `User ${message.senderId}`;
            }
            return message;
        });
        
        res.json(messagesWithSenders);
    } catch (error) {
        console.error('Error getting direct messages:', error);
        res.status(500).json({ error: 'Failed to get direct messages' });
    }
};

// Get list of DM conversations for current user
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