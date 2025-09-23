const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { users, servers, serverMembers } = require('../models');

exports.register = (req, res) => {
  const { username, email, password } = req.body;
  
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: 'Username already exists' });
  }
  
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 8);
  const user = { 
    id: users.length + 1, 
    username, 
    email, 
    password: hashedPassword,
    createdAt: new Date(),
    bio: '',
    avatar: null,
    banner: null
  };
  users.push(user);
  
  res.status(201).json({ message: 'User registered successfully' });
};

exports.login = (req, res) => {
  const { emailOrUsername, password } = req.body;
  
  // Allow login with either email or username
  const user = users.find(u => 
    u.username === emailOrUsername || u.email === emailOrUsername
  );
  
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email }, 
    process.env.JWT_SECRET, 
    { expiresIn: '24h' }
  );
  
  res.json({ 
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || null,
      banner: user.banner || null,
      status: user.status || 'online',
      bio: user.bio || ''
    }
  });
};

exports.getProfile = (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
};

// Helper function to get user by ID
exports.getUserById = (userId) => {
  return users.find(u => u.id === parseInt(userId));
};

// Validate user session
exports.validateSession = (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  const user = exports.getUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Return user data (excluding password)
    const { password, ...userWithoutPassword } = user;
    res.json({ 
      valid: true, 
      user: {
        ...userWithoutPassword,
        avatar: user.avatar || null,
          banner: user.banner || null,
          status: user.status || 'online',
          bio: user.bio || ''
      }
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Export users array for other controllers
exports.getAllUsers = () => users;

// Search users by username
exports.searchUsers = (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.id;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }
    
    const searchResults = users
      .filter(user => 
        user.id !== currentUserId && 
        user.username.toLowerCase().includes(q.toLowerCase())
      )
      .map(user => ({
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        avatar: user.avatar || null
      }))
      .slice(0, 10); // Limit to 10 results
    
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update current user's profile (username, avatar, banner, bio)
exports.updateMe = (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { username, avatar, banner, bio } = req.body || {};

    // Validate and update username (if provided)
    if (typeof username === 'string') {
      const trimmed = username.trim();
      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Username must be at least 2 characters' });
      }
      // Ensure uniqueness (excluding current user)
      const exists = users.find(u => u.username.toLowerCase() === trimmed.toLowerCase() && u.id !== user.id);
      if (exists) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      user.username = trimmed;
    }

    // Update avatar (Data URL or http url); allow null to clear
    if (typeof avatar !== 'undefined') {
      if (avatar === null || avatar === '') {
        user.avatar = null;
      } else if (typeof avatar === 'string') {
        // Basic guard: accept data:image or a URL path
        if (avatar.startsWith('data:image') || avatar.startsWith('/uploads/') || avatar.startsWith('http')) {
          user.avatar = avatar;
        } else {
          return res.status(400).json({ error: 'Invalid avatar format' });
        }
      }
    }

    // Update banner (Data URL or http url/gif); allow null to clear
    if (typeof banner !== 'undefined') {
      if (banner === null || banner === '') {
        user.banner = null;
      } else if (typeof banner === 'string') {
        // Accept images or gifs
        if (banner.startsWith('data:image') || banner.startsWith('/uploads/') || banner.startsWith('http')) {
          user.banner = banner;
        } else {
          return res.status(400).json({ error: 'Invalid banner format' });
        }
      }
    }

    // Update bio (optional, max 190 chars)
    if (typeof bio !== 'undefined') {
      if (bio === null) user.bio = '';
      else if (typeof bio === 'string') {
        const trimmedBio = bio.trim();
        if (trimmedBio.length > 190) {
          return res.status(400).json({ error: 'Bio must be 190 characters or less' });
        }
        user.bio = trimmedBio;
      }
    }

    const { password, ...safeUser } = user;

    // Emit real-time user update to all connected clients
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('user-updated', {
          id: safeUser.id,
          username: safeUser.username,
          avatar: safeUser.avatar || null,
          banner: safeUser.banner || null,
          bio: safeUser.bio || ''
        });
      }
    } catch (e) {
      console.warn('Warning: failed to emit user-updated event:', e);
    }

    res.json({ message: 'Profile updated', user: safeUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Public profile by user ID: includes basic user info and the list of servers they are a member of
exports.getPublicProfileById = (req, res) => {
  try {
    const targetId = parseInt(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'Invalid user id' });
    const user = users.find(u => u.id === targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // List servers where user is a member
    const memberships = serverMembers.filter(m => m.userId === targetId);
    const userServers = memberships.map(m => {
      const s = servers.find(sv => sv.id === m.serverId);
      return s ? { id: s.id, name: s.name, icon: s.icon || null } : null;
    }).filter(Boolean);

    const { password, ...safe } = user;
    res.json({
      id: safe.id,
      username: safe.username,
      avatar: safe.avatar || null,
      banner: safe.banner || null,
      bio: safe.bio || '',
      servers: userServers
    });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
};
