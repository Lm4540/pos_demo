const express = require('express');
const router = express.Router();
const authController = require('./auth-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');

// Vistas tradicionales
router.get('/login', authController.renderLogin);
router.post('/login', authController.handleLogin);
router.get('/logout', authController.handleLogout);

// WebAuthn / Biometría - Registro (Requiere iniciar sesión primero)
router.get('/register-options', authMiddleware, authController.getRegistrationOptions);
router.post('/register-verification', authMiddleware, authController.verifyRegistration);

// WebAuthn / Biometría - Login rápido (Público)
router.get('/login-options', authController.getLoginOptions);
router.post('/login-verification', authController.verifyLogin);

module.exports = router;
