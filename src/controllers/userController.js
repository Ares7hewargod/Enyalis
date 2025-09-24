const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { users, servers, serverMembers } = require('../models'); // in-memory fallback / other collections
const { pool, isActive, USE_DB } = require('../db');
const { bufferNewUser } = require('../dbBuffer');

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Check duplicates in DB
    let newId;
    if (isActive()) {
      const existing = await pool.query('SELECT 1 FROM users WHERE username=$1 OR email=$2 LIMIT 1', [username, email]);
      if (existing.rowCount > 0) {
        return res.status(400).json({ message: 'Username or Email already exists' });
      }
      const hashedPassword = bcrypt.hashSync(password, 10);
      const insert = await pool.query(
        'INSERT INTO users (username, email, password) VALUES ($1,$2,$3) RETURNING id, username, email, avatar, banner, bio, status, created_at',
        [username, email, hashedPassword]
      );
      const row = insert.rows[0];
      newId = row.id;
      users.push({
        id: row.id,
        username: row.username,
        email: row.email,
        password: hashedPassword,
        avatar: row.avatar,
        banner: row.banner,
        bio: row.bio || '',
        status: row.status || 'online',
        createdAt: row.created_at
      });
    } else {
      // Pure in-memory fallback
      if (users.find(u => u.username === username) || users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'Username or Email already exists' });
      }
      const hashedPassword = bcrypt.hashSync(password, 10);
      newId = users.length + 1;
      const userObj = {
        id: newId,
        username,
        email,
        password: hashedPassword,
        createdAt: new Date(),
        bio: '',
        avatar: null,
        banner: null,
        status: 'online'
      };
      users.push(userObj);
      // If DB is intended (USE_DB true) but inactive, buffer for later flush
      if (USE_DB) {
        bufferNewUser(userObj);
      }
    }
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }
    // Try DB first
    if (isActive()) {
      const dbUser = await pool.query('SELECT * FROM users WHERE username=$1 OR email=$1 LIMIT 1', [emailOrUsername]);
      if (dbUser.rowCount === 1) {
        const userRecord = dbUser.rows[0];
        const valid = bcrypt.compareSync(password, userRecord.password);
        if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
        if (!users.find(u => u.id === userRecord.id)) {
          users.push({
            id: userRecord.id,
            username: userRecord.username,
            email: userRecord.email,
            password: userRecord.password,
            avatar: userRecord.avatar,
            banner: userRecord.banner,
            bio: userRecord.bio || '',
            status: userRecord.status || 'online',
            createdAt: userRecord.created_at
          });
        }
        const token = jwt.sign({ id: userRecord.id, username: userRecord.username, email: userRecord.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          token,
          user: {
            id: userRecord.id,
            username: userRecord.username,
            email: userRecord.email,
            avatar: userRecord.avatar || null,
            banner: userRecord.banner || null,
            status: userRecord.status || 'online',
            bio: userRecord.bio || ''
          }
        });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    } else {
      const user = users.find(u => u.username === emailOrUsername || u.email === emailOrUsername);
      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.json({
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
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
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

// Load all users from DB into memory (used on startup to preserve profile data across restarts)
exports.loadAllUsersFromDb = async () => {
  try {
    if (!isActive()) return 0;
    const res = await pool.query('SELECT * FROM users');
    let added = 0;
    res.rows.forEach(row => {
      if (!users.find(u => u.id === row.id)) {
        users.push({
          id: row.id,
          username: row.username,
          email: row.email,
          password: row.password,
          avatar: row.avatar,
          banner: row.banner,
          bio: row.bio || '',
          status: row.status || 'online',
          createdAt: row.created_at
        });
        added++;
      }
    });
    if (added) console.log(`[DB] Loaded ${added} users from database into memory`);
    return added;
  } catch (err) {
    console.warn('Failed to load users from DB:', err.code || err.message);
    return 0;
  }
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
exports.updateMe = async (req, res) => {
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

    // Update bio (optional) — allow richer multi-line content (basic markdown) up to 1000 chars
    if (typeof bio !== 'undefined') {
      if (bio === null) {
        user.bio = '';
      } else if (typeof bio === 'string') {
        // Preserve intentional newlines and spacing inside; trim only ends
        const sanitized = bio.replace(/\r\n?/g, '\n').trimEnd();
        if (sanitized.length > 1000) {
          return res.status(400).json({ error: 'Bio must be 1000 characters or less' });
        }
        user.bio = sanitized;
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

    // Defer DB persistence to background queue for snappy response
    if (isActive()) {
      try {
        const { enqueue } = require('../persistQueue');
        // Basic uniqueness pre-check only if username changed
        if (typeof username === 'string') {
          // Quick optimistic check in memory; true uniqueness still DB-enforced by UNIQUE constraint
          const duplicate = users.find(u => u.id !== user.id && u.username.toLowerCase() === user.username.toLowerCase());
          if (duplicate) {
            return res.status(400).json({ error: 'Username already exists' });
          }
        }
        enqueue({
          type: 'updateUser',
          userId: user.id,
          fields: {
            username: user.username,
            avatar: user.avatar || null,
            banner: user.banner || null,
            bio: user.bio || '',
            status: user.status || 'online'
          }
        });
      } catch (e) {
        console.warn('Enqueue update failed (will rely on next change):', e.message);
      }
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
