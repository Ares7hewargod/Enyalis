const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { users } = require('../models');

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
    createdAt: new Date()
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
      email: user.email
    }
  });
};

exports.getProfile = (req, res) => {
  // Placeholder: In production, extract user from JWT
  res.json({ message: 'User profile endpoint' });
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
      user: userWithoutPassword 
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
        createdAt: user.createdAt
      }))
      .slice(0, 10); // Limit to 10 results
    
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
