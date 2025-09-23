const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/validate', userController.validateSession);
router.get('/me', authenticateToken, userController.getProfile);
router.put('/me', authenticateToken, userController.updateMe);
router.get('/search', authenticateToken, userController.searchUsers);
// Public profile endpoint (requires auth to prevent scraping abuse; can relax later)
router.get('/:userId/profile', authenticateToken, userController.getPublicProfileById);

module.exports = router;
