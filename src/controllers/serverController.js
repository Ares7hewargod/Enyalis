const { servers, channels, messages, serverMembers, roles, generateId, generateInviteCode } = require('../models');
const { getUserById } = require('./userController');
const { USE_DB: DB_ENABLED, getPool } = require('../db');
let serverRepo, channelRepo, roleRepo;
try {
    serverRepo = require('../repositories/serverRepo');
    channelRepo = require('../repositories/channelRepo');
    roleRepo = require('../repositories/roleRepo');
} catch (e) {
    console.warn('Repository load failed (likely before creation) - using in-memory only', e.message);
}

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
exports.createServer = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.userId;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Server name is required' });
        if (DB_ENABLED && serverRepo && channelRepo && roleRepo) {
            const server = await serverRepo.createServer({ name: name.trim(), description: description || '', ownerId: userId });
            await serverRepo.addMember({ serverId: server.id, userId, role: 'owner' });
            await roleRepo.ensureDefaultRole(server.id);
            const defaultChannel = await channelRepo.createChannel({ serverId: server.id, name: 'general', type: 'text', position: 0 });
            return res.status(201).json({ server, defaultChannel, message: 'Server created successfully' });
        }
        // Fallback in-memory
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
        const membership = { id: generateId(), serverId: server.id, userId, role: 'owner', joinedAt: new Date() };
        serverMembers.push(membership);
        const defaultChannel = { id: generateId(), serverId: server.id, name: 'general', type: 'text', position: 0, createdAt: new Date() };
        channels.push(defaultChannel);
        ensureDefaultRole(server.id);
        res.status(201).json({ server, defaultChannel, message: 'Server created successfully (memory)' });
    } catch (error) {
        console.error('Create server error:', error);
        res.status(500).json({ error: 'Failed to create server' });
    }
};

// Join server by invite code
exports.joinServer = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.userId;
    if (DB_ENABLED && serverRepo) {
      const pool = getPool();
      const { rows } = await pool.query('SELECT * FROM servers WHERE UPPER(invite_code) = UPPER($1)', [inviteCode]);
      const server = rows[0];
      if (!server) return res.status(404).json({ error: 'Invalid invite code' });
      const mCheck = await pool.query('SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2', [server.id, userId]);
      if (mCheck.rows.length) return res.status(400).json({ error: 'You are already a member of this server' });
      await serverRepo.addMember({ serverId: server.id, userId, role: 'member' });
      try { const io = req.app.get('io'); if (io) io.emit('server-member-updated', { serverId: server.id, userId, role: 'member', roleId: null, action: 'joined' }); } catch {}
      return res.json({ server, message: 'Successfully joined server' });
    }
    // Fallback memory logic
    const server = servers.find(s => s.inviteCode === inviteCode.toUpperCase());
    if (!server) return res.status(404).json({ error: 'Invalid invite code' });
    const existingMembership = serverMembers.find(m => m.serverId === server.id && m.userId === userId);
    if (existingMembership) return res.status(400).json({ error: 'You are already a member of this server' });
    const membership = { id: generateId(), serverId: server.id, userId, role: 'member', joinedAt: new Date() };
    serverMembers.push(membership);
    try { const io = req.app.get('io'); if (io) io.emit('server-member-updated', { serverId: server.id, userId, role: 'member', roleId: null, action: 'joined' }); } catch {}
    res.json({ server, message: 'Successfully joined server (memory)' });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ error: 'Failed to join server' });
  }
};

// Get user's servers
exports.getUserServers = async (req, res) => {
  try {
    const userId = req.userId;
    if (DB_ENABLED && serverRepo) {
      const serversList = await serverRepo.getServersForUser(userId);
      const mapped = serversList.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        icon: s.icon,
        ownerId: s.owner_id,
        inviteCode: s.invite_code,
        createdAt: s.created_at,
        role: s.role,
        joinedAt: s.joined_at
      }));
      return res.json({ servers: mapped });
    }
    const userMemberships = serverMembers.filter(m => m.userId === userId);
    const userServers = userMemberships.map(m => ({ ...servers.find(s => s.id === m.serverId), role: m.role, joinedAt: m.joinedAt }));
    res.json({ servers: userServers });
  } catch (error) {
    console.error('Get user servers error:', error);
    res.status(500).json({ error: 'Failed to get servers' });
  }
};

// Get server channels
exports.getServerChannels = async (req, res) => {
  try {
    const { serverId } = req.params; const userId = req.userId;
    if (DB_ENABLED && channelRepo) {
      const pool = getPool();
      const mem = await pool.query('SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
      if (!mem.rows.length) return res.status(403).json({ error: 'You are not a member of this server' });
      const list = await channelRepo.getChannels(serverId);
      return res.json({ channels: list });
    }
    const membership = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
    if (!membership) return res.status(403).json({ error: 'You are not a member of this server' });
    const serverChannels = channels.filter(c => c.serverId == serverId).sort((a,b)=>a.position-b.position);
    res.json({ channels: serverChannels });
  } catch (error) {
    console.error('Get server channels error:', error);
    res.status(500).json({ error: 'Failed to get channels' });
  }
};

// Create channel in server
exports.createChannel = async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, description, type = 'text' } = req.body;
    const userId = req.userId;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Channel name is required' });
    if (DB_ENABLED) {
      const { getPool } = require('../db');
      const pool = getPool();
      const actor = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
      if (!actor.rows.length || !['owner','admin'].includes(actor.rows[0].role)) return res.status(403).json({ error: 'You do not have permission to create channels' });
      const existing = await pool.query('SELECT 1 FROM channels WHERE server_id = $1 AND name = $2', [serverId, name.trim().toLowerCase().replace(/\s+/g,'-')]);
      const channel = await channelRepo.createChannel({ serverId, name: name.trim().toLowerCase().replace(/\s+/g,'-'), type, topic: description || null });
      return res.status(201).json({ channel, message: 'Channel created successfully' });
    }
    const membership = serverMembers.find(m => m.serverId == serverId && m.userId === userId && (m.role === 'owner' || m.role === 'admin'));
    if (!membership) return res.status(403).json({ error: 'You do not have permission to create channels' });
    const maxPosition = Math.max(...channels.filter(c=>c.serverId==serverId).map(c=>c.position), -1);
    const channel = { id: generateId(), serverId: parseFloat(serverId), name: name.trim().toLowerCase().replace(/\s+/g,'-'), description: description||'', type, position: maxPosition+1, createdAt: new Date() };
    channels.push(channel);
    res.status(201).json({ channel, message: 'Channel created successfully (memory)' });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Failed to create channel' });
  }
};

// Get server members
exports.getServerMembers = async (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.userId;
        if (DB_ENABLED && serverRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const server = await pool.query('SELECT id FROM servers WHERE id = $1', [serverId]);
          if (!server.rows.length) return res.status(404).json({ error: 'Server not found' });
          const userMem = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!userMem.rows.length) return res.status(403).json({ error: 'You do not have access to this server' });
          const membersRaw = await serverRepo.getMembers(serverId);
          const rolePriority = { owner:0, admin:1, member:2 };
          const members = membersRaw.map(m=>({ userId: m.user_id, username: m.username, avatar: m.avatar, role: m.role, roleId: null, joinedAt: m.joined_at }))
            .sort((a,b)=> (rolePriority[a.role]||999)-(rolePriority[b.role]||999) || a.username.localeCompare(b.username));
          return res.json({ members });
        }
        // memory fallback
        const server = servers.find(s => s.id == serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const userMembership = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!userMembership) return res.status(403).json({ error: 'You do not have access to this server' });
        const members = serverMembers.filter(m=>m.serverId==serverId).map(m=>{ const user = getUserById(m.userId); return { userId: m.userId, username: user?user.username:`User ${m.userId}`, avatar: user?(user.avatar||null):null, role: m.role, roleId: m.roleId||null, joinedAt: m.joinedAt }; }).sort((a,b)=>{ const rp={owner:0,admin:1,member:2}; const ap=rp[a.role]||999; const bp=rp[b.role]||999; return ap!==bp?ap-bp:a.username.localeCompare(b.username); });
        res.json({ members });
    } catch (error) {
        console.error('Get server members error:', error);
        res.status(500).json({ error: 'Failed to get server members' });
    }
};

// Update server settings (owner only)
exports.updateServer = async (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, description, icon } = req.body;
        const userId = req.userId;
        if (DB_ENABLED && serverRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const { rows } = await pool.query('SELECT * FROM servers WHERE id = $1', [serverId]);
          if (!rows.length) return res.status(404).json({ error: 'Server not found' });
          const server = rows[0];
          if (server.owner_id !== userId) return res.status(403).json({ error: 'Only server owners can update server settings' });
          const updated = await serverRepo.updateServer(serverId, { name: name?name.trim():undefined, description: description?description.trim():undefined, icon });
          updated.updatedAt = new Date();
          try { const io = req.app.get('io'); if (io) io.emit('server-updated', { id: updated.id, name: updated.name, description: updated.description||'', icon: updated.icon||null, ownerId: updated.owner_id, updatedAt: updated.updatedAt }); } catch {}
          return res.json({ server: { id: updated.id, name: updated.name, description: updated.description, icon: updated.icon, ownerId: updated.owner_id, updatedAt: updated.updatedAt }, message: 'Server updated successfully' });
        }
        const server = servers.find(s => s.id == serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        if (server.ownerId !== userId) return res.status(403).json({ error: 'Only server owners can update server settings' });
        if (name && name.trim()) server.name = name.trim();
        if (description !== undefined) server.description = description.trim();
        if (icon !== undefined) server.icon = icon;
        server.updatedAt = new Date();
        try { const io = req.app.get('io'); if (io) io.emit('server-updated', { id: server.id, name: server.name, description: server.description||'', icon: server.icon||null, ownerId: server.ownerId, updatedAt: server.updatedAt }); } catch {}
        res.json({ server, message: 'Server updated successfully (memory)' });
    } catch (error) {
        console.error('Update server error:', error);
        res.status(500).json({ error: 'Failed to update server' });
    }
};

// Get server roles
exports.getServerRoles = async (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.userId;
        if (DB_ENABLED && roleRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const membership = await pool.query('SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!membership.rows.length) return res.status(403).json({ error: 'You are not a member of this server' });
          await roleRepo.ensureDefaultRole(serverId);
          const list = await roleRepo.listRoles(serverId);
          return res.json({ roles: list });
        }
        const membership = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!membership) return res.status(403).json({ error: 'You are not a member of this server' });
        ensureDefaultRole(parseFloat(serverId));
        const serverRoles = roles.filter(r=>r.serverId==serverId).sort((a,b)=>a.position-b.position);
        res.json({ roles: serverRoles });
    } catch (error) {
        console.error('Get server roles error:', error);
        res.status(500).json({ error: 'Failed to get server roles' });
    }
};

// Create new role (owner/admin only)
exports.createRole = async (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, color = '#5865f2', permissions = [] } = req.body;
        const userId = req.userId;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Role name is required' });
        if (DB_ENABLED && roleRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const actor = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!actor.rows.length || !['owner','admin'].includes(actor.rows[0].role)) return res.status(403).json({ error: 'You do not have permission to create roles' });
          const role = await roleRepo.createRole(serverId, { name: name.trim(), color, permissions: Array.isArray(permissions)?permissions:[] });
          return res.status(201).json({ role, message: 'Role created successfully' });
        }
        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) return res.status(403).json({ error: 'You do not have permission to create roles' });
        const maxPosition = Math.max(...roles.filter(r=>r.serverId==serverId).map(r=>r.position),0);
        const role = { id: generateId(), serverId: parseFloat(serverId), name: name.trim(), color, permissions: Array.isArray(permissions)?permissions:[], position: maxPosition+1, isDefault:false, createdAt: new Date() };
        roles.push(role);
        res.status(201).json({ role, message: 'Role created successfully (memory)' });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({ error: 'Failed to create role' });
    }
};

// Update role (owner/admin only)
exports.updateRole = async (req, res) => {
    try {
        const { serverId, roleId } = req.params;
        const { name, color, permissions, position } = req.body;
        const userId = req.userId;
        if (DB_ENABLED && roleRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const actor = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!actor.rows.length || !['owner','admin'].includes(actor.rows[0].role)) return res.status(403).json({ error: 'You do not have permission to update roles' });
          // ensure not default
          const defaultCheck = await pool.query('SELECT is_default FROM server_roles WHERE id = $1 AND server_id = $2', [roleId, serverId]);
          if (!defaultCheck.rows.length) return res.status(404).json({ error: 'Role not found' });
          if (defaultCheck.rows[0].is_default) return res.status(400).json({ error: 'Cannot modify default role' });
          const updated = await roleRepo.updateRole(serverId, roleId, { name: name&&name.trim(), color, permissions: Array.isArray(permissions)?permissions:undefined, position });
          return res.json({ role: updated, message: 'Role updated successfully' });
        }
        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) return res.status(403).json({ error: 'You do not have permission to update roles' });
        const role = roles.find(r => r.id == roleId && r.serverId == serverId);
        if (!role) return res.status(404).json({ error: 'Role not found' });
        if (role.isDefault) return res.status(400).json({ error: 'Cannot modify default role' });
        if (name && name.trim()) role.name = name.trim();
        if (color !== undefined) role.color = color;
        if (Array.isArray(permissions)) role.permissions = permissions;
        if (typeof position === 'number') role.position = position;
        res.json({ role, message: 'Role updated successfully (memory)' });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
};

// Delete role (owner/admin only)
exports.deleteRole = async (req, res) => {
    try {
        const { serverId, roleId } = req.params;
        const userId = req.userId;
        if (DB_ENABLED && roleRepo) {
          const { getPool } = require('../db');
          const pool = getPool();
          const actor = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!actor.rows.length || !['owner','admin'].includes(actor.rows[0].role)) return res.status(403).json({ error: 'You do not have permission to delete roles' });
          const check = await pool.query('SELECT is_default FROM server_roles WHERE id = $1 AND server_id = $2', [roleId, serverId]);
          if (!check.rows.length) return res.status(404).json({ error: 'Role not found' });
          if (check.rows[0].is_default) return res.status(400).json({ error: 'Cannot delete default role' });
          const success = await roleRepo.deleteRole(serverId, roleId);
          return res.json({ success, roleId: parseInt(roleId), message: 'Role deleted successfully' });
        }
        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === userId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) return res.status(403).json({ error: 'You do not have permission to delete roles' });
        const idx = roles.findIndex(r => r.id == roleId && r.serverId == serverId);
        if (idx === -1) return res.status(404).json({ error: 'Role not found' });
        if (roles[idx].isDefault) return res.status(400).json({ error: 'Cannot delete default role' });
        const removed = roles.splice(idx,1)[0];
        serverMembers.forEach(m=>{ if (m.serverId==serverId && m.roleId==roleId) m.roleId=null; });
        res.json({ role: removed, message: 'Role deleted successfully (memory)' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({ error: 'Failed to delete role' });
    }
};

// Update member role (owner/admin only)
exports.updateMemberRole = async (req, res) => {
    try {
        const { serverId, userId } = req.params;
        const { role, roleId } = req.body;
        const actorId = req.userId;
        if (DB_ENABLED) {
          const { getPool } = require('../db');
          const pool = getPool();
          const actor = await pool.query('SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, actorId]);
          if (!actor.rows.length || !['owner','admin'].includes(actor.rows[0].role)) return res.status(403).json({ error: 'You do not have permission to update member roles' });
          const membershipRows = await pool.query('SELECT * FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]);
          if (!membershipRows.rows.length) return res.status(404).json({ error: 'Member not found' });
          const membership = membershipRows.rows[0];
          if (membership.role === 'owner' && actor.rows[0].role !== 'owner') return res.status(403).json({ error: 'Only the owner can modify the owner role' });
          let newRole = membership.role;
          if (role) {
            if (!['member','admin','owner'].includes(role)) return res.status(400).json({ error: 'Invalid base role' });
            if ((role === 'admin' || role === 'owner') && actor.rows[0].role !== 'owner') return res.status(403).json({ error: 'Only the owner can assign admin/owner roles' });
            newRole = role;
          }
          await pool.query('UPDATE server_members SET role = $3 WHERE server_id = $1 AND user_id = $2', [serverId, userId, newRole]);
          try { const io = req.app.get('io'); if (io) io.emit('server-member-updated', { serverId: parseFloat(serverId), userId: parseFloat(userId), role: newRole, roleId: null, action: 'role-changed' }); } catch {}
          return res.json({ message: 'Member role updated', member: { userId: parseFloat(userId), role: newRole } });
        }
        const actor = serverMembers.find(m => m.serverId == serverId && m.userId === actorId);
        if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) return res.status(403).json({ error: 'You do not have permission to update member roles' });
        const membership = serverMembers.find(m => m.serverId == serverId && m.userId == userId);
        if (!membership) return res.status(404).json({ error: 'Member not found' });
        if (membership.role === 'owner' && actor.role !== 'owner') return res.status(403).json({ error: 'Only the owner can modify the owner role' });
        if (role) { if (!['member','admin','owner'].includes(role)) return res.status(400).json({ error: 'Invalid base role' }); if ((role==='admin'||role==='owner') && actor.role!=='owner') return res.status(403).json({ error: 'Only the owner can assign admin/owner roles' }); membership.role = role; }
        if (typeof roleId !== 'undefined') { if (roleId === null) { membership.roleId = null; } else { const r = roles.find(r => r.id == roleId && r.serverId == serverId); if (!r) return res.status(404).json({ error: 'Role not found' }); membership.roleId = r.id; } }
        try { const io = req.app.get('io'); if (io) io.emit('server-member-updated', { serverId: parseFloat(serverId), userId: parseFloat(userId), role: membership.role, roleId: membership.roleId ?? null, action: 'role-changed' }); } catch {}
        res.json({ message: 'Member role updated (memory)', member: membership });
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
    deleteServer: async (req, res) => {
        try {
            const { serverId } = req.params; const userId = req.userId;
            if (DB_ENABLED) {
              const pool = getPool();
              const { rows } = await pool.query('SELECT * FROM servers WHERE id = $1', [serverId]);
              if (!rows.length) return res.status(404).json({ error: 'Server not found' });
              const server = rows[0];
              if (server.owner_id !== userId) return res.status(403).json({ error: 'Only the owner can delete this server' });
              // Collect affected members
              const members = await pool.query('SELECT user_id FROM server_members WHERE server_id = $1', [serverId]);
              await pool.query('DELETE FROM servers WHERE id = $1', [serverId]); // cascades
              try {
                const io = req.app.get('io');
                if (io) {
                  const payload = { serverId: parseInt(serverId,10), serverName: server.name };
                    for (const m of members.rows) {
                      io.to(`user-${m.user_id}`).emit('server-deleted', payload);
                    }
                }
              } catch {}
              return res.json({ message: 'Server deleted successfully' });
            }
            // Fallback in-memory delete
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