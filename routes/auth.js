const express = require('express');
const { redirectToGitHub, handleGitHubCallback, logout } = require('../controllers/authController');

const router = express.Router();

// OAuth Redirect Route
router.get('/github', redirectToGitHub);

// OAuth Callback Route
router.get('/github/callback', handleGitHubCallback);

// Logout route
router.get('/logout', logout);

module.exports = router; 