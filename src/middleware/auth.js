const jwt = require('jsonwebtoken');
const { getUserById } = require('../controllers/userController');

// Middleware to verify JWT token and attach user ID to request
const authenticateToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Access token is required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = getUserById(decoded.id);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.userId = user.id;
        req.user = user;
        next();
    } catch (error) {
        console.error('Token authentication error:', error);
        res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authenticateToken };
