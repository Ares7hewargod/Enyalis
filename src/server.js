require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// Database initialization
const { init: initDb, pool } = require('./db');
const { start: startPersistQueue } = require('./persistQueue');
const { loadAllUsersFromDb } = require('./controllers/userController');

const userRoutes = require('./routes/userRoutes');
const channelRoutes = require('./routes/channelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const serverRoutes = require('./routes/serverRoutes');
const friendRoutes = require('./routes/friendRoutes');
const { getUserById } = require('./controllers/userController');

// Increase JSON/urlencoded body limits to allow data URL images for icons/avatars
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../public')));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Make io available to routes
app.set('io', io);

app.use('/api/users', userRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/friends', friendRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// Central error handler: return JSON for common errors (like 413)
// Must be defined after routes/middleware
app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({ error: 'Payload too large' });
    }
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ error: 'Internal server error' });
});

// Handle invite links - redirect to chat with invite code in URL
app.get('/invite/:inviteCode', (req, res) => {
    const inviteCode = req.params.inviteCode;
    res.redirect(`/chat.html?invite=${inviteCode}`);
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = getUserById(decoded.id);
        
        if (!user) {
            return next(new Error('User not found'));
        }

        // Attach user to socket
        socket.userId = user.id;
        socket.username = user.username;
        next();
    } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.id})`);
    
    // Join user's personal room for notifications
    socket.join(`user-${socket.userId}`);
    
    // Join a channel room
    socket.on('join-channel', (channelId) => {
        socket.join(`channel-${channelId}`);
        console.log(`User ${socket.username} joined channel ${channelId}`);
    });
    
    // Leave a channel room
    socket.on('leave-channel', (channelId) => {
        socket.leave(`channel-${channelId}`);
        console.log(`User ${socket.username} left channel ${channelId}`);
    });

    // Typing indicators
    socket.on('typing', (data = {}) => {
        try {
            const { scope, channelId, recipientId } = data;
            const payload = {
                userId: socket.userId,
                username: socket.username,
                avatar: getUserById(socket.userId)?.avatar || null,
                scope,
                channelId: channelId || null,
                recipientId: recipientId || null,
                ts: Date.now()
            };
            if (scope === 'channel' && channelId) {
                // Broadcast to channel excluding sender
                socket.to(`channel-${channelId}`).emit('user-typing', payload);
            } else if (scope === 'dm' && recipientId) {
                // Send to recipient user room
                socket.to(`user-${recipientId}`).emit('user-typing', payload);
            }
        } catch (e) {
            console.warn('Typing event error:', e.message);
        }
    });

    socket.on('stop-typing', (data = {}) => {
        try {
            const { scope, channelId, recipientId } = data;
            const payload = {
                userId: socket.userId,
                scope,
                channelId: channelId || null,
                recipientId: recipientId || null
            };
            if (scope === 'channel' && channelId) {
                socket.to(`channel-${channelId}`).emit('user-stop-typing', payload);
            } else if (scope === 'dm' && recipientId) {
                socket.to(`user-${recipientId}`).emit('user-stop-typing', payload);
            }
        } catch (e) {
            console.warn('Stop typing event error:', e.message);
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username} (${socket.id})`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Initialize database tables after server starts then load users
initDb()
    .then(async () => {
        console.log('Database initialized');
            // Start background persistence queue
            startPersistQueue(() => pool);
        try {
            const count = await loadAllUsersFromDb();
            if (count) console.log(`Loaded ${count} users from DB into memory.`);
        } catch (e) {
            console.warn('Could not load users from DB:', e.message);
        }
    })
    .catch(err => {
        console.error('Database init error:', err);
    });
