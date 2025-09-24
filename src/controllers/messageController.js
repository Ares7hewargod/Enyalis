const { messages, directMessages, channels, serverMembers, generateId } = require('../models');
const { getUserById } = require('./userController');
const { USE_DB } = process.env;
let messageRepo, channelRepo;
try { messageRepo = require('../repositories/messageRepo'); } catch (e) { console.warn('messageRepo not loaded', e.message); }
try { channelRepo = require('../repositories/channelRepo'); } catch (e) { console.warn('channelRepo not loaded', e.message); }
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

// Edit channel or direct message
exports.editMessage = async (req, res) => {
    try {
        const { scope, id } = req.params; // scope: 'channel' | 'dm'
        const { content } = req.body;
        const userId = req.userId;
        if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ error: 'Content required' });
        if (USE_DB === 'true' && messageRepo) {
            if (scope === 'channel') {
                const updated = await messageRepo.updateChannelMessage({ messageId: parseInt(id), userId, content: content.trim() });
                if (!updated) return res.status(404).json({ error: 'Message not found' });
                const payload = { id: updated.id, channelId: updated.channel_id, userId: updated.user_id, content: updated.content, edited: updated.edited, editedAt: updated.edited_at };
                try { const io = req.app.get('io'); if (io) io.to(`channel-${updated.channel_id}`).emit('message-edited', payload); } catch {}
                return res.json({ message: payload });
            } else if (scope === 'dm') {
                const updated = await messageRepo.updateDirectMessage({ messageId: parseInt(id), userId, content: content.trim() });
                if (!updated) return res.status(404).json({ error: 'Message not found' });
                const payload = { id: updated.id, senderId: updated.sender_id, recipientId: updated.recipient_id, text: updated.content, edited: updated.edited, editedAt: updated.edited_at };
                try { const io = req.app.get('io'); if (io) { io.to(`user-${updated.sender_id}`).emit('dm-message-edited', payload); io.to(`user-${updated.recipient_id}`).emit('dm-message-edited', payload); } } catch {}
                return res.json({ message: payload });
            }
            return res.status(400).json({ error: 'Invalid scope' });
        }
        // Memory fallback
        if (scope === 'channel') {
            const msg = messages.find(m => m.id == id && m.userId === userId);
            if (!msg) return res.status(404).json({ error: 'Message not found' });
            msg.content = content.trim();
            msg.edited = true; msg.editedAt = new Date();
            try { const io = req.app.get('io'); if (io) io.to(`channel-${msg.channelId}`).emit('message-edited', { id: msg.id, channelId: msg.channelId, content: msg.content, edited: msg.edited, editedAt: msg.editedAt }); } catch {}
            return res.json({ message: msg });
        } else if (scope === 'dm') {
            const msg = directMessages.find(m => m.id == id && m.senderId === userId);
            if (!msg) return res.status(404).json({ error: 'Message not found' });
            msg.text = content.trim();
            msg.edited = true; msg.editedAt = new Date();
            try { const io = req.app.get('io'); if (io) { io.to(`user-${msg.senderId}`).emit('dm-message-edited', msg); io.to(`user-${msg.recipientId}`).emit('dm-message-edited', msg); } } catch {}
            return res.json({ message: msg });
        }
        res.status(400).json({ error: 'Invalid scope' });
    } catch (e) {
        console.error('Edit message error:', e);
        res.status(500).json({ error: 'Failed to edit message' });
    }
};

// Delete (soft) channel or direct message
exports.deleteMessage = async (req, res) => {
    try {
        const { scope, id } = req.params; // scope: 'channel' | 'dm'
        const userId = req.userId;
        if (USE_DB === 'true' && messageRepo) {
            if (scope === 'channel') {
                const deleted = await messageRepo.softDeleteChannelMessage({ messageId: parseInt(id), userId });
                if (!deleted) return res.status(404).json({ error: 'Message not found' });
                const payload = { id: deleted.id, channelId: deleted.channel_id, deleted: true };
                try { const io = req.app.get('io'); if (io) io.to(`channel-${deleted.channel_id}`).emit('message-deleted', payload); } catch {}
                return res.json({ message: payload });
            } else if (scope === 'dm') {
                const deleted = await messageRepo.softDeleteDirectMessage({ messageId: parseInt(id), userId });
                if (!deleted) return res.status(404).json({ error: 'Message not found' });
                const payload = { id: deleted.id, senderId: deleted.sender_id, recipientId: deleted.recipient_id, deleted: true };
                try { const io = req.app.get('io'); if (io) { io.to(`user-${deleted.sender_id}`).emit('dm-message-deleted', payload); io.to(`user-${deleted.recipient_id}`).emit('dm-message-deleted', payload); } } catch {}
                return res.json({ message: payload });
            }
            return res.status(400).json({ error: 'Invalid scope' });
        }
        // Memory fallback
        if (scope === 'channel') {
            const msg = messages.find(m => m.id == id && m.userId === userId);
            if (!msg) return res.status(404).json({ error: 'Message not found' });
            msg.deleted = true;
            try { const io = req.app.get('io'); if (io) io.to(`channel-${msg.channelId}`).emit('message-deleted', { id: msg.id, channelId: msg.channelId, deleted: true }); } catch {}
            return res.json({ message: { id: msg.id, deleted: true } });
        } else if (scope === 'dm') {
            const msg = directMessages.find(m => m.id == id && m.senderId === userId);
            if (!msg) return res.status(404).json({ error: 'Message not found' });
            msg.deleted = true;
            try { const io = req.app.get('io'); if (io) { io.to(`user-${msg.senderId}`).emit('dm-message-deleted', { id: msg.id, deleted: true }); io.to(`user-${msg.recipientId}`).emit('dm-message-deleted', { id: msg.id, deleted: true }); } } catch {}
            return res.json({ message: { id: msg.id, deleted: true } });
        }
        res.status(400).json({ error: 'Invalid scope' });
    } catch (e) {
        console.error('Delete message error:', e);
        res.status(500).json({ error: 'Failed to delete message' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { channelId, recipientId, text, type } = req.body;
        const userId = req.userId; // From auth middleware
        const uploadedFiles = req.files || [];
        
        // Get user info
    const user = getUserById(userId);
    const username = user ? user.username : `User ${userId}`;
    const userAvatar = user ? (user.avatar || null) : null;
        
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
            if (USE_DB === 'true' && messageRepo) {
                const dbMsg = await messageRepo.createDirectMessage({ senderId: userId, recipientId: parseInt(recipientId), content: text || '' });
                const message = {
                    id: dbMsg.id,
                    senderId: dbMsg.sender_id,
                    recipientId: dbMsg.recipient_id,
                    text: dbMsg.content,
                    attachments,
                    createdAt: dbMsg.created_at,
                    username,
                    avatar: userAvatar
                };
                const io = req.app.get('io');
                if (io) {
                    io.to(`user-${recipientId}`).emit('new-direct-message', message);
                    io.to(`user-${userId}`).emit('new-direct-message', message);
                }
                return res.status(201).json(message);
            }
            const message = { id: generateId(), senderId: userId, recipientId: parseInt(recipientId), text: text || '', attachments, createdAt: new Date(), username, avatar: userAvatar };
            directMessages.push(message);
            const io = req.app.get('io');
            if (io) { io.to(`user-${recipientId}`).emit('new-direct-message', message); io.to(`user-${userId}`).emit('new-direct-message', message); }
            res.status(201).json(message);
        } else if (type === 'channel' && channelId) {
            // Send channel message
            console.log('Sending channel message:', { channelId, userId, text });
            let channel;
            if (USE_DB === 'true' && channelRepo) {
                channel = await channelRepo.getChannel(channelId);
            } else {
                channel = channels.find(c => c.id == channelId);
            }
            if (!channel) {
                console.log('Channel not found:', channelId);
                return res.status(404).json({ error: 'Channel not found' });
            }

            // Check if user is member of the server
            if (USE_DB === 'true') {
                const { getPool } = require('../db');
                const pool = getPool();
                const serverIdForChannel = channel.serverId || channel.server_id;
                const mem = await pool.query('SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2', [serverIdForChannel, userId]);
                if (!mem.rows.length) {
                    console.log('User not member of server:', { userId, serverId: serverIdForChannel });
                    return res.status(403).json({ error: 'You do not have access to this channel' });
                }
            } else {
                const membership = serverMembers.find(m => m.serverId === channel.serverId && m.userId === userId);
                if (!membership) {
                    console.log('User not member of server:', { userId, serverId: channel.serverId });
                    return res.status(403).json({ error: 'You do not have access to this channel' });
                }
            }
            
            if (USE_DB === 'true' && messageRepo) {
                const dbMsg = await messageRepo.createChannelMessage({ channelId: parseFloat(channelId), userId, content: text || '' });
                const message = { id: dbMsg.id, channelId: dbMsg.channel_id, userId: dbMsg.user_id, username, content: dbMsg.content, attachments, timestamp: dbMsg.created_at, edited: dbMsg.edited, editedAt: dbMsg.edited_at, avatar: userAvatar || null };
                const io = req.app.get('io');
                if (io) io.to(`channel-${channelId}`).emit('new-message', message);
                return res.status(201).json(message);
            }
            const message = { id: generateId(), channelId: parseFloat(channelId), userId, username, content: text || '', attachments, timestamp: new Date(), edited: false, editedAt: null };
            if (userAvatar) message.avatar = userAvatar;
            messages.push(message);
            const io = req.app.get('io');
            if (io) io.to(`channel-${channelId}`).emit('new-message', message);
            res.status(201).json(message);
        } else {
            return res.status(400).json({ error: 'Invalid message type or missing parameters' });
        }
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

exports.getMessagesByChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.userId;
        
        console.log('[getMessagesByChannel] user', userId, 'loading channel', channelId);

        if (USE_DB === 'true' && channelRepo && messageRepo) {
            try {
                const channel = await channelRepo.getChannel(channelId);
                if (!channel) {
                    console.log('[getMessagesByChannel] Channel not found in DB:', channelId);
                    return res.status(404).json({ error: 'Channel not found' });
                }
                const { getPool } = require('../db');
                const pool = getPool();
                const mem = await pool.query('SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2', [channel.serverId, userId]);
                if (!mem.rows.length) {
                    console.log('[getMessagesByChannel] membership check failed', { userId, serverId: channel.serverId });
                    return res.status(403).json({ error: 'You do not have access to this channel' });
                }
                const msgs = await messageRepo.getRecentChannelMessages({ channelId: parseFloat(channelId), limit: 200 });
                // Oldest -> newest for UI
                const ordered = msgs.sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
                const enriched = ordered.map(m => {
                    const u = getUserById(m.user_id);
                    return {
                        id: m.id,
                        channelId: m.channel_id,
                        userId: m.user_id,
                        username: u ? u.username : `User ${m.user_id}`,
                        avatar: u ? (u.avatar || null) : null,
                        content: m.content,
                        attachments: [],
                        timestamp: m.created_at,
                        edited: m.edited,
                        editedAt: m.edited_at,
                        deleted: m.deleted
                    };
                });
                return res.json({ messages: enriched });
            } catch (dbErr) {
                console.error('[getMessagesByChannel] DB path error:', dbErr);
                return res.status(500).json({ error: 'Failed to get messages' });
            }
        }

        // Fallback in-memory path
        const channel = channels.find(c => c.id == channelId);
        if (!channel) {
            console.log('[getMessagesByChannel][memory] Channel not found:', channelId);
            return res.status(404).json({ error: 'Channel not found' });
        }
        const membership = serverMembers.find(m => m.serverId === channel.serverId && m.userId === userId);
        if (!membership) {
            console.log('[getMessagesByChannel][memory] membership check failed', { userId, serverId: channel.serverId });
            return res.status(403).json({ error: 'You do not have access to this channel' });
        }
        const channelMessages = messages
            .filter(m => m.channelId === parseFloat(channelId))
            .sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
        const messagesWithUsernames = channelMessages.map(message => {
            const u = getUserById(message.userId);
            if (!message.username) message.username = u ? u.username : `User ${message.userId}`;
            if (typeof message.avatar === 'undefined') message.avatar = u ? (u.avatar || null) : null;
            return message;
        });
        res.json({ messages: messagesWithUsernames });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
};

// Get direct messages between current user and another user
exports.getDirectMessages = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.userId;
        const otherId = parseInt(userId, 10);
        if (Number.isNaN(otherId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (otherId === currentUserId) {
            // Optional: allow self-DM to persist notes (still supported)
        }
        // (Optional future) enforce friendship check here
        if (USE_DB === 'true' && messageRepo) {
            let msgs;
            try {
                msgs = await messageRepo.getRecentDirectMessages({ userA: currentUserId, userB: otherId, limit: 200 });
            } catch (e) {
                console.error('[getDirectMessages] DB retrieval failed', { currentUserId, otherId, code: e.code, message: e.message });
                return res.status(500).json({ error: 'Failed to load direct messages' });
            }
            const transformed = msgs.map(m => {
                const u = getUserById(m.sender_id);
                return {
                    id: m.id,
                    senderId: m.sender_id,
                    recipientId: m.recipient_id,
                    text: m.content,
                    attachments: [],
                    createdAt: m.created_at,
                    username: u ? u.username : `User ${m.sender_id}`,
                    avatar: u ? (u.avatar || null) : null,
                    edited: m.edited,
                    editedAt: m.edited_at,
                    deleted: m.deleted
                };
            });
            return res.json(transformed);
        }
        const userMessages = directMessages.filter(dm => (dm.senderId === currentUserId && dm.recipientId == otherId) || (dm.senderId == otherId && dm.recipientId === currentUserId)).sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
        const messagesWithSenders = userMessages.map(message => {
            const sender = getUserById(message.senderId);
            if (!message.username) message.username = sender ? sender.username : `User ${message.senderId}`;
            if (typeof message.avatar === 'undefined') message.avatar = sender ? (sender.avatar || null) : null;
            return message;
        });
        res.json(messagesWithSenders);
    } catch (error) {
        console.error('Error getting direct messages:', error);
        res.status(500).json({ error: 'Failed to get direct messages' });
    }
};

// Get list of DM conversations for current user
exports.getDMConversations = async (req, res) => {
    try {
        const currentUserId = req.userId;
        if (USE_DB === 'true') {
            const { getPool } = require('../db');
            const pool = getPool();
            // Last message per conversation pair
            const { rows } = await pool.query(`
              WITH ordered AS (
                SELECT *,
                  LEAST(sender_id, recipient_id) AS a,
                  GREATEST(sender_id, recipient_id) AS b,
                  ROW_NUMBER() OVER (PARTITION BY LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id) ORDER BY created_at DESC, id DESC) AS rn
                FROM direct_messages
                WHERE sender_id = $1 OR recipient_id = $1
              )
              SELECT * FROM ordered WHERE rn = 1
            `, [currentUserId]);
            const convSet = new Map();
            for (const r of rows) {
              const otherId = r.sender_id === currentUserId ? r.recipient_id : r.sender_id;
              const user = getUserById(otherId);
              convSet.set(otherId, {
                id: otherId,
                username: user ? user.username : `User ${otherId}`,
                avatar: user ? (user.avatar || null) : null,
                lastMessage: r.content,
                lastMessageTime: r.created_at
              });
            }
            return res.json(Array.from(convSet.values()));
        }
        const conversationUserIds = new Set();
        directMessages.forEach(dm => { if (dm.senderId === currentUserId) conversationUserIds.add(dm.recipientId); else if (dm.recipientId === currentUserId) conversationUserIds.add(dm.senderId); });
        const conversations = Array.from(conversationUserIds).map(uid => { const user = getUserById(uid); const lastMessage = directMessages.filter(dm => (dm.senderId===currentUserId && dm.recipientId===uid) || (dm.senderId===uid && dm.recipientId===currentUserId)).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt))[0]; return { id: uid, username: user?user.username:`User ${uid}`, avatar: user?(user.avatar||null):null, lastMessage: lastMessage?lastMessage.text:'No messages yet', lastMessageTime: lastMessage?lastMessage.createdAt:null }; });
        res.json(conversations);
    } catch (error) {
        console.error('Error getting DM conversations:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
};