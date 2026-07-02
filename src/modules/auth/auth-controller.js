const { User, WebAuthnCredential, Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const webauthnConfig = require('../../config/webauthn');

const renderLogin = (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return res.render('pages/auth/login', {
    title: 'Iniciar Sesión',
    error: null
  });
};

const handleLogin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({
      where: { username },
      include: [{ model: Branch, as: 'branch' }]
    });

    if (!user) {
      await logAction({
        action: 'auth.login_failed',
        details: { username, reason: 'user_not_found' },
        ipAddress: req.ip
      });
      return res.render('pages/auth/login', {
        title: 'Iniciar Sesión',
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    if (user.status === 'blocked') {
      await logAction({
        userId: user.id,
        branchId: user.branchId,
        action: 'auth.login_failed',
        details: { reason: 'account_blocked' },
        ipAddress: req.ip
      });
      return res.render('pages/auth/login', {
        title: 'Iniciar Sesión',
        error: 'Tu cuenta está bloqueada por exceso de intentos fallidos. Contacta a tu supervisor.'
      });
    }

    if (user.status === 'inactive') {
      await logAction({
        userId: user.id,
        branchId: user.branchId,
        action: 'auth.login_failed',
        details: { reason: 'account_inactive' },
        ipAddress: req.ip
      });
      return res.render('pages/auth/login', {
        title: 'Iniciar Sesión',
        error: 'Tu cuenta se encuentra inactiva.'
      });
    }

    const isValidPassword = await user.validatePassword(password);

    if (!isValidPassword) {
      user.loginAttempts += 1;
      
      if (user.loginAttempts >= 5) {
        user.status = 'blocked';
        await user.save();
        await logAction({
          userId: user.id,
          branchId: user.branchId,
          action: 'auth.account_blocked',
          details: { reason: 'max_failed_attempts_reached' },
          ipAddress: req.ip
        });
        return res.render('pages/auth/login', {
          title: 'Iniciar Sesión',
          error: 'Has superado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada.'
        });
      }

      await user.save();
      await logAction({
        userId: user.id,
        branchId: user.branchId,
        action: 'auth.login_failed',
        details: { reason: 'invalid_password', attempt: user.loginAttempts },
        ipAddress: req.ip
      });

      return res.render('pages/auth/login', {
        title: 'Iniciar Sesión',
        error: `Usuario o contraseña incorrectos. Intentos restantes: ${5 - user.loginAttempts}`
      });
    }

    // Reset attempts on successful login
    user.loginAttempts = 0;
    await user.save();

    // Set Session
    req.session.userId = user.id;

    await logAction({
      userId: user.id,
      branchId: user.branchId,
      action: 'auth.login_success',
      ipAddress: req.ip
    });

    // Update custom column in Sessions table for revocation mapping
    try {
      await sequelize.query('UPDATE Sessions SET userId = ? WHERE session_id = ?', {
        replacements: [user.id, req.sessionID]
      });
    } catch (e) {
      // If Sequelize connection is in index we can get it
      const { sequelize } = require('../../core/models');
      await sequelize.query('UPDATE Sessions SET userId = ? WHERE session_id = ?', {
        replacements: [user.id, req.sessionID]
      });
    }

    return res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    return res.render('pages/auth/login', {
      title: 'Iniciar Sesión',
      error: 'Ha ocurrido un error en el servidor.'
    });
  }
};

const handleLogout = async (req, res) => {
  const userId = req.session?.userId;
  if (userId) {
    await logAction({
      userId,
      action: 'auth.logout',
      ipAddress: req.ip
    });
  }
  req.session.destroy(() => {
    return res.redirect('/auth/login');
  });
};

// --- WebAuthn / Biometrics Registration ---

const getRegistrationOptions = async (req, res) => {
  try {
    const user = req.user;
    const credentials = await WebAuthnCredential.findAll({ where: { userId: user.id } });

    const options = await generateRegistrationOptions({
      rpName: webauthnConfig.rpName,
      rpID: webauthnConfig.rpID,
      userID: Buffer.from(user.id.toString()).toString('base64url'),
      userName: user.username,
      userDisplayName: user.fullName,
      excludeCredentials: credentials.map(cred => ({
        id: Buffer.from(cred.id, 'base64url'),
        type: 'public-key'
      })),
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred'
      }
    });

    req.session.currentChallenge = options.challenge;
    return res.json(options);
  } catch (error) {
    console.error('Error generating registration options:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const verifyRegistration = async (req, res) => {
  try {
    const user = req.user;
    const expectedChallenge = req.session.currentChallenge;

    if (!expectedChallenge) {
      return res.status(400).json({ success: false, message: 'Falta el reto de registro.' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: webauthnConfig.origin,
      expectedRPID: webauthnConfig.rpID
    });

    if (verification.verified) {
      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

      await WebAuthnCredential.create({
        id: Buffer.from(credentialID).toString('base64url'),
        userId: user.id,
        publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter,
        deviceType: verification.registrationInfo.credentialDeviceType || 'unknown'
      });

      await logAction({
        userId: user.id,
        branchId: user.branchId,
        action: 'auth.webauthn_registered',
        ipAddress: req.ip
      });

      req.session.currentChallenge = null;
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, message: 'La verificación del registro WebAuthn falló.' });
  } catch (error) {
    console.error('Error verifying registration:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- WebAuthn / Biometrics Login ---

const getLoginOptions = async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: webauthnConfig.rpID,
      userVerification: 'preferred'
    });

    req.session.currentChallenge = options.challenge;
    return res.json(options);
  } catch (error) {
    console.error('Error generating login options:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const verifyLogin = async (req, res) => {
  try {
    const expectedChallenge = req.session.currentChallenge;
    const credentialId = req.body.id;

    if (!expectedChallenge) {
      return res.status(400).json({ success: false, message: 'Falta el reto de autenticación.' });
    }

    const credential = await WebAuthnCredential.findByPk(credentialId);
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Biometría no registrada en este dispositivo.' });
    }

    const user = await User.findByPk(credential.userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado.' });
    }

    if (user.status === 'blocked') {
      return res.status(400).json({ success: false, message: 'Tu cuenta está bloqueada.' });
    }

    if (user.status === 'inactive') {
      return res.status(400).json({ success: false, message: 'Tu cuenta está inactiva.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: webauthnConfig.origin,
      expectedRPID: webauthnConfig.rpID,
      authenticator: {
        credentialID: Buffer.from(credential.id, 'base64url'),
        credentialPublicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter
      }
    });

    if (verification.verified) {
      credential.counter = verification.authenticationInfo.newCounter;
      await credential.save();

      // Reset login attempts
      user.loginAttempts = 0;
      await user.save();

      // Start Session
      req.session.userId = user.id;

      await logAction({
        userId: user.id,
        branchId: user.branchId,
        action: 'auth.login_biometric_success',
        ipAddress: req.ip
      });

      // Update Session DB column
      const { sequelize } = require('../../core/models');
      await sequelize.query('UPDATE Sessions SET userId = ? WHERE session_id = ?', {
        replacements: [user.id, req.sessionID]
      });

      req.session.currentChallenge = null;
      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, message: 'Firma de biometría inválida.' });
  } catch (error) {
    console.error('Error verifying login:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  renderLogin,
  handleLogin,
  handleLogout,
  getRegistrationOptions,
  verifyRegistration,
  getLoginOptions,
  verifyLogin
};
