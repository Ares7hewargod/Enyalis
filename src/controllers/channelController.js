const { channels, servers, serverMembers, generateId } = require('../models');
const { getUserById } = require('./userController');

exports.createChannel = (req, res) => {
    try {
        const { serverId, name, description } = req.body;
        const userId = req.userId; // From auth middleware
        
        console.log('Creating channel:', { serverId, name, description, userId });
        
        // Verify server exists
        const server = servers.find(s => s.id == serverId);
        if (!server) {
            return res.status(404).json({ message: 'Server not found' });
        }
        
        // Check if user is owner or admin of the server
        const membership = serverMembers.find(m => 
            m.serverId == serverId && m.userId === userId && (m.role === 'owner' || m.role === 'admin')
        );
        
        if (!membership) {
            return res.status(403).json({ message: 'Only server owners and admins can create channels' });
        }
        
        // Check if channel name already exists in this server
        if (channels.find(c => c.serverId == serverId && c.name === name)) {
            return res.status(400).json({ message: 'Channel name already exists in this server' });
        }
        
        const channel = { 
            id: generateId(),
            serverId: parseFloat(serverId),
            name: name,
            description: description || '',
            type: 'text',
            position: channels.filter(c => c.serverId == serverId).length,
            createdAt: new Date()
        };
        
        channels.push(channel);
        console.log('Channel created:', channel);
        
        res.status(201).json(channel);
    } catch (error) {
        console.error('Create channel error:', error);
        res.status(500).json({ message: 'Failed to create channel' });
    }
};

exports.getChannels = (req, res) => {
    try {
        const { serverId } = req.query;
        const userId = req.userId;
        
        if (serverId) {
            // Get channels for a specific server
            const server = servers.find(s => s.id == serverId);
            if (!server) {
                return res.status(404).json({ message: 'Server not found' });
            }
            
            // Check if user is member of the server
            const membership = serverMembers.find(m => 
                m.serverId == serverId && m.userId === userId
            );
            
            if (!membership) {
                return res.status(403).json({ message: 'You do not have access to this server' });
            }
            
            const serverChannels = channels
                .filter(c => c.serverId == serverId)
                .sort((a, b) => a.position - b.position);
                
            res.json({ channels: serverChannels });
        } else {
            // Get all channels (admin function - you might want to restrict this)
            res.json({ channels });
        }
    } catch (error) {
        console.error('Get channels error:', error);
        res.status(500).json({ message: 'Failed to get channels' });
    }
};
