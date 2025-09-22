const { servers, channels, serverMembers, generateId, generateInviteCode } = require('../models');
const { getUserById } = require('./userController');

// Create a new server
exports.createServer = (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.userId; // From JWT middleware
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Server name is required' });
        }

        const server = {
            id: generateId(),
            name: name.trim(),
            description: description || '',
            icon: null,
            ownerId: userId,
            inviteCode: generateInviteCode(),
            createdAt: new Date()
        };

        servers.push(server);

        // Add creator as server member with owner role
        const membership = {
            id: generateId(),
            serverId: server.id,
            userId: userId,
            role: 'owner',
            joinedAt: new Date()
        };
        serverMembers.push(membership);

        // Create default general channel
        const defaultChannel = {
            id: generateId(),
            serverId: server.id,
            name: 'general',
            type: 'text',
            position: 0,
            createdAt: new Date()
        };
        channels.push(defaultChannel);

        res.status(201).json({
            server,
            defaultChannel,
            message: 'Server created successfully'
        });
    } catch (error) {
        console.error('Create server error:', error);
        res.status(500).json({ error: 'Failed to create server' });
    }
};

// Join server by invite code
exports.joinServer = (req, res) => {
    try {
        const { inviteCode } = req.body;
        const userId = req.userId;

        const server = servers.find(s => s.inviteCode === inviteCode.toUpperCase());
        if (!server) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        // Check if user is already a member
        const existingMembership = serverMembers.find(m => 
            m.serverId === server.id && m.userId === userId
        );

        if (existingMembership) {
            return res.status(400).json({ error: 'You are already a member of this server' });
        }

        // Add user as member
        const membership = {
            id: generateId(),
            serverId: server.id,
            userId: userId,
            role: 'member',
            joinedAt: new Date()
        };
        serverMembers.push(membership);

        res.json({ 
            server,
            message: 'Successfully joined server' 
        });
    } catch (error) {
        console.error('Join server error:', error);
        res.status(500).json({ error: 'Failed to join server' });
    }
};

// Get user's servers
exports.getUserServers = (req, res) => {
    try {
        const userId = req.userId;

        const userMemberships = serverMembers.filter(m => m.userId === userId);
        const userServers = userMemberships.map(membership => {
            const server = servers.find(s => s.id === membership.serverId);
            return {
                ...server,
                role: membership.role,
                joinedAt: membership.joinedAt
            };
        });

        res.json({ servers: userServers });
    } catch (error) {
        console.error('Get user servers error:', error);
        res.status(500).json({ error: 'Failed to get servers' });
    }
};

// Get server channels
exports.getServerChannels = (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.userId;

        // Check if user is a member of this server
        const membership = serverMembers.find(m => 
            m.serverId == serverId && m.userId === userId
        );

        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this server' });
        }

        const serverChannels = channels
            .filter(c => c.serverId == serverId)
            .sort((a, b) => a.position - b.position);

        res.json({ channels: serverChannels });
    } catch (error) {
        console.error('Get server channels error:', error);
        res.status(500).json({ error: 'Failed to get channels' });
    }
};

// Create channel in server
exports.createChannel = (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, type = 'text' } = req.body;
        const userId = req.userId;

        // Check if user has permission (owner or admin)
        const membership = serverMembers.find(m => 
            m.serverId == serverId && m.userId === userId && 
            (m.role === 'owner' || m.role === 'admin')
        );

        if (!membership) {
            return res.status(403).json({ error: 'You do not have permission to create channels' });
        }

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Channel name is required' });
        }

        const maxPosition = Math.max(
            ...channels.filter(c => c.serverId == serverId).map(c => c.position),
            -1
        );

        const channel = {
            id: generateId(),
            serverId: parseInt(serverId),
            name: name.trim().toLowerCase().replace(/\s+/g, '-'),
            type: type,
            position: maxPosition + 1,
            createdAt: new Date()
        };

        channels.push(channel);

        res.status(201).json({
            channel,
            message: 'Channel created successfully'
        });
    } catch (error) {
        console.error('Create channel error:', error);
        res.status(500).json({ error: 'Failed to create channel' });
    }
};

module.exports = {
    createServer: exports.createServer,
    joinServer: exports.joinServer,
    getUserServers: exports.getUserServers,
    getServerChannels: exports.getServerChannels,
    createChannel: exports.createChannel
};