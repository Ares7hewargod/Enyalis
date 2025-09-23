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

const userRoutes = require('./routes/userRoutes');
const channelRoutes = require('./routes/channelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const serverRoutes = require('./routes/serverRoutes');
const friendRoutes = require('./routes/friendRoutes');
const { getUserById } = require('./controllers/userController');

app.use(express.json());
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
    
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username} (${socket.id})`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
