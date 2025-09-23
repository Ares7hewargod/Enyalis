const { servers, channels, messages, serverMembers, roles, generateId, generateInviteCode } = require('../models');
const { getUserById } = require('./userController');

// Helper: ensure default role exists for a server
function ensureDefaultRole(serverId) {
    const exists = roles.some(r => r.serverId == serverId && r.isDefault);
    if (!exists) {
        roles.push({
            id: generateId(),
            serverId: serverId,
            name: '@everyone',
            color: '#dcddde',
            permissions: [],
            position: 0,
            isDefault: true,
            createdAt: new Date()
        });
    }
}

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

    // Ensure default role exists
    ensureDefaultRole(server.id);

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

        // Notify others that a member joined
        try {
            const io = req.app.get('io');
            if (io) {
                io.emit('server-member-updated', {
                    serverId: server.id,
                    userId: userId,
                    role: 'member',
                    roleId: null,
                    action: 'joined'
                });
            }
        } catch (e) {
            console.warn('Warning: failed to emit server-member-updated (joined):', e);
        }

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
        const { name, description, type = 'text' } = req.body;
        const userId = req.userId;

        console.log('Creating channel:', { serverId, name, description, userId });
        console.log('Request userId:', userId);
        console.log('Request params:', req.params);
        console.log('Request body:', req.body);

        // Check if user has permission (owner or admin)
        const membership = serverMembers.find(m => 
            m.serverId == serverId && m.userId === userId && 
            (m.role === 'owner' || m.role === 'admin')
        );

        console.log('User membership:', membership);

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
            serverId: parseFloat(serverId), // Use parseFloat to preserve decimal precision
            name: name.trim().toLowerCase().replace(/\s+/g, '-'),
            description: description || '',
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

// Get server members
exports.getServerMembers = (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.userId;
        
        console.log('Getting members for server:', serverId, 'by user:', userId);
        
        // Verify server exists
        const server = servers.find(s => s.id == serverId);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }
        
        // Check if user is member of the server
        const userMembership = serverMembers.find(m => 
            m.serverId == serverId && m.userId === userId
        );
        
        if (!userMembership) {
            return res.status(403).json({ error: 'You do not have access to this server' });
        }
        
        // Get all server members with user info
        const members = serverMembers
            .filter(m => m.serverId == serverId)
            .map(membership => {
                const user = getUserById(membership.userId);
                return {
                    userId: membership.userId,
                    username: user ? user.username : `User ${membership.userId}`,
                    avatar: user ? (user.avatar || null) : null,
                    role: membership.role,
                    roleId: membership.roleId || null,
                    joinedAt: membership.joinedAt
                };
            })
            .sort((a, b) => {
                // Sort by role priority: owner > admin > member
                const rolePriority = { owner: 0, admin: 1, member: 2 };
                const aPriority = rolePriority[a.role] || 999;
                const bPriority = rolePriority[b.role] || 999;
                if (aPriority !== bPriority) {
                    return aPriority - bPriority;
                }
                // Then sort by username
                return a.username.localeCompare(b.username);
            });
        
        console.log('Found members:', members.length);
        res.json({ members });
    } catch (error) {
        console.error('Get server members error:', error);
        res.status(500).json({ error: 'Failed to get server members' });
    }
};

// Update server settings (owner only)
exports.updateServer = (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, description, icon } = req.body;
        const userId = req.userId;

        const server = servers.find(s => s.id == serverId);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Check if user is the server owner
        if (server.ownerId !== userId) {
            return res.status(403).json({ error: 'Only server owners can update server settings' });
        }

        // Update server properties
        if (name !== undefined && name.trim()) {
            server.name = name.trim();
        }
        if (description !== undefined) {
            server.description = description.trim();
        }
        if (icon !== undefined) {
            server.icon = icon;
        }

        server.updatedAt = new Date();

        // Emit real-time server update so all clients refresh metadata/icons
        try {
            const io = req.app.get('io');
            if (io) {
                io.emit('server-updated', {
                    id: server.id,
                    name: server.name,
                    description: server.description || '',
                    icon: server.icon || null,
                    ownerId: server.ownerId,
                    updatedAt: server.updatedAt
                });
            }
        } catch (e) {
            console.warn('Warning: failed to emit server-updated event:', e);
        }

        res.json({
            server,
            message: 'Server updated successfully'
        });
    } catch (error) {
        console.error('Update server error:', error);
        res.status(500).json({ error: 'Failed to update server' });
    }
};

// Get server roles
exports.getServerRoles = (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.userId;

        // Check if user is a member of this server
        const membership = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this server' });
        }

        // Ensure default exists
        ensureDefaultRole(parseFloat(serverId));

        const serverRoles = roles
            .filter(r => r.serverId == serverId)
            .sort((a, b) => a.position - b.position);
        res.json({ roles: serverRoles });
    } catch (error) {
        console.error('Get server roles error:', error);
        res.status(500).json({ error: 'Failed to get server roles' });
    }
};

// Create new role (owner/admin only)
exports.createRole = (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, color = '#5865f2', permissions = [] } = req.body;
        const userId = req.userId;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Role name is required' });
        }

        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
            return res.status(403).json({ error: 'You do not have permission to create roles' });
        }

        const maxPosition = Math.max(
            ...roles.filter(r => r.serverId == serverId).map(r => r.position),
            0
        );

        const role = {
            id: generateId(),
            serverId: parseFloat(serverId),
            name: name.trim(),
            color,
            permissions: Array.isArray(permissions) ? permissions : [],
            position: maxPosition + 1,
            isDefault: false,
            createdAt: new Date()
        };
        roles.push(role);
        res.status(201).json({ role, message: 'Role created successfully' });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({ error: 'Failed to create role' });
    }
};

// Update role (owner/admin only)
exports.updateRole = (req, res) => {
    try {
        const { serverId, roleId } = req.params;
        const { name, color, permissions, position } = req.body;
        const userId = req.userId;

        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
            return res.status(403).json({ error: 'You do not have permission to update roles' });
        }

        const role = roles.find(r => r.id == roleId && r.serverId == serverId);
        if (!role) return res.status(404).json({ error: 'Role not found' });
        if (role.isDefault) return res.status(400).json({ error: 'Cannot modify default role' });

        if (name !== undefined && name.trim()) role.name = name.trim();
        if (color !== undefined) role.color = color;
        if (Array.isArray(permissions)) role.permissions = permissions;
        if (typeof position === 'number') role.position = position;
        res.json({ role, message: 'Role updated successfully' });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
};

// Delete role (owner/admin only)
exports.deleteRole = (req, res) => {
    try {
        const { serverId, roleId } = req.params;
        const userId = req.userId;

        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
            return res.status(403).json({ error: 'You do not have permission to delete roles' });
        }

        const idx = roles.findIndex(r => r.id == roleId && r.serverId == serverId);
        if (idx === -1) return res.status(404).json({ error: 'Role not found' });
        if (roles[idx].isDefault) return res.status(400).json({ error: 'Cannot delete default role' });

        const removed = roles.splice(idx, 1)[0];
        // Remove roleId from members
        serverMembers.forEach(m => {
            if (m.serverId == serverId && m.roleId == roleId) m.roleId = null;
        });
        res.json({ role: removed, message: 'Role deleted successfully' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({ error: 'Failed to delete role' });
    }
};

// Update member role (owner/admin only)
exports.updateMemberRole = (req, res) => {
    try {
        const { serverId, userId } = req.params;
        const { role, roleId } = req.body;
        const actorId = req.userId;

        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === actorId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
            return res.status(403).json({ error: 'You do not have permission to update member roles' });
        }

        const membership = serverMembers.find(m => m.serverId == serverId && m.userId == userId);
        if (!membership) return res.status(404).json({ error: 'Member not found' });

        // Prevent non-owner from modifying owner base role
        if (membership.role === 'owner' && actor.role !== 'owner') {
            return res.status(403).json({ error: 'Only the owner can modify the owner role' });
        }

        if (role) {
            if (!['member', 'admin', 'owner'].includes(role)) {
                return res.status(400).json({ error: 'Invalid base role' });
            }
            if ((role === 'admin' || role === 'owner') && actor.role !== 'owner') {
                return res.status(403).json({ error: 'Only the owner can assign admin/owner roles' });
            }
            membership.role = role;
        }

        if (typeof roleId !== 'undefined') {
            if (roleId === null) {
                membership.roleId = null;
            } else {
                const r = roles.find(r => r.id == roleId && r.serverId == serverId);
                if (!r) return res.status(404).json({ error: 'Role not found' });
                membership.roleId = r.id;
            }
        }
        // Emit role change event for real-time UI updates
        try {
            const io = req.app.get('io');
            if (io) {
                io.emit('server-member-updated', {
                    serverId: parseFloat(serverId),
                    userId: parseFloat(userId),
                    role: membership.role,
                    roleId: membership.roleId ?? null,
                    action: 'role-changed'
                });
            }
        } catch (e) {
            console.warn('Warning: failed to emit server-member-updated (role-changed):', e);
        }

        res.json({ message: 'Member role updated', member: membership });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ error: 'Failed to update member role' });
    }
};

module.exports = {
    createServer: exports.createServer,
    joinServer: exports.joinServer,
    // Add new export for preview endpoint
    previewByInvite: (req, res) => {
        try {
            const { inviteCode } = req.params;
            if (!inviteCode) {
                return res.status(400).json({ error: 'Invite code is required' });
            }

            const server = servers.find(s => s.inviteCode === inviteCode.toUpperCase());
            if (!server) {
                return res.status(404).json({ error: 'Invalid invite code' });
            }

            // Build lightweight preview payload (no sensitive data)
            const memberCount = serverMembers.filter(m => m.serverId === server.id).length;
            res.json({
                server: {
                    id: server.id,
                    name: server.name,
                    description: server.description || '',
                    icon: server.icon || null,
                    inviteCode: server.inviteCode,
                    ownerId: server.ownerId
                },
                stats: {
                    memberCount
                }
            });
        } catch (error) {
            console.error('Server preview error:', error);
            res.status(500).json({ error: 'Failed to preview server' });
        }
    },
    getUserServers: exports.getUserServers,
    getServerChannels: exports.getServerChannels,
    createChannel: exports.createChannel,
    getServerMembers: exports.getServerMembers,
    updateServer: exports.updateServer,
    getServerRoles: exports.getServerRoles,
    createRole: exports.createRole,
    updateRole: exports.updateRole,
    deleteRole: exports.deleteRole,
    updateMemberRole: exports.updateMemberRole,
    kickMember: (req, res) => {
        try {
            const { serverId, userId } = req.params;
            const actorId = req.userId;

            const actor = serverMembers.find(m => m.serverId == serverId && m.userId === actorId);
            if (!actor) return res.status(403).json({ error: 'Not a server member' });

            const targetIdx = serverMembers.findIndex(m => m.serverId == serverId && m.userId == userId);
            if (targetIdx === -1) return res.status(404).json({ error: 'Member not found' });

            const target = serverMembers[targetIdx];
            if (target.role === 'owner') return res.status(403).json({ error: 'Cannot kick the owner' });

            // Owner can kick anyone (except owner). Admins can kick only members
            if (actor.role !== 'owner' && !(actor.role === 'admin' && target.role === 'member')) {
                return res.status(403).json({ error: 'Insufficient permissions to kick this member' });
            }

            serverMembers.splice(targetIdx, 1);
            // Notify kicked user via WebSocket
            try {
                const io = req.app.get('io');
                if (io) {
                    // Notify the kicked user
                    io.to(`user-${userId}`).emit('server-kicked', { serverId: parseFloat(serverId) });
                    // Optionally notify others in the server to refresh members list
                    io.emit('server-member-updated', { serverId: parseFloat(serverId), userId: parseFloat(userId), action: 'kicked' });
                }
            } catch (notifyErr) {
                console.warn('Warning: failed to emit server-kicked/server-member-updated event', notifyErr);
            }

            res.json({ message: 'Member kicked' });
        } catch (err) {
            console.error('Kick member error:', err);
            res.status(500).json({ error: 'Failed to kick member' });
        }
    }
    ,
    // Delete server (owner only)
    deleteServer: (req, res) => {
        try {
            const { serverId } = req.params;
            const userId = req.userId;

            const serverIdx = servers.findIndex(s => s.id == serverId);
            if (serverIdx === -1) return res.status(404).json({ error: 'Server not found' });
            const server = servers[serverIdx];

            if (server.ownerId !== userId) {
                return res.status(403).json({ error: 'Only the owner can delete this server' });
            }

            // Collect affected member userIds before deletion
            const affectedMembers = serverMembers
                .filter(m => m.serverId == serverId)
                .map(m => m.userId);

            // Remove channels belonging to this server and their messages
            const channelIds = channels
                .filter(c => c.serverId == serverId)
                .map(c => c.id);
            // Remove channels
            for (let i = channels.length - 1; i >= 0; i--) {
                if (channels[i].serverId == serverId) channels.splice(i, 1);
            }
            // Remove messages in those channels
            for (let i = messages.length - 1; i >= 0; i--) {
                if (channelIds.includes(messages[i].channelId)) messages.splice(i, 1);
            }

            // Remove roles for this server
            for (let i = roles.length - 1; i >= 0; i--) {
                if (roles[i].serverId == serverId) roles.splice(i, 1);
            }

            // Remove server memberships
            for (let i = serverMembers.length - 1; i >= 0; i--) {
                if (serverMembers[i].serverId == serverId) serverMembers.splice(i, 1);
            }

            // Finally remove the server itself
            servers.splice(serverIdx, 1);

            // Emit real-time notification to all affected users
            try {
                const io = req.app.get('io');
                if (io) {
                    const payload = { serverId: parseFloat(serverId), serverName: server.name };
                    // Notify each member in their personal room
                    const notified = new Set();
                    for (const uid of affectedMembers) {
                        if (notified.has(uid)) continue;
                        io.to(`user-${uid}`).emit('server-deleted', payload);
                        notified.add(uid);
                    }
                    // Also notify the owner (in case not included above)
                    if (!notified.has(userId)) {
                        io.to(`user-${userId}`).emit('server-deleted', payload);
                    }
                }
            } catch (notifyErr) {
                console.warn('Warning: failed to emit server-deleted event', notifyErr);
            }

            res.json({ message: 'Server deleted successfully' });
        } catch (err) {
            console.error('Delete server error:', err);
            res.status(500).json({ error: 'Failed to delete server' });
        }
    }
};