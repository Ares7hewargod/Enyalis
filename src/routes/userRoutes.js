const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/validate', userController.validateSession);
router.get('/me', userController.getProfile);
router.get('/search', authenticateToken, userController.searchUsers);

module.exports = router;
