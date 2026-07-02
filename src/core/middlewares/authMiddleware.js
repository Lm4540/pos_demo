const { User, Branch } = require('../models');

module.exports = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId, {
        include: [{ model: Branch, as: 'branch' }]
      });

      if (!user) {
        req.session.destroy(() => {
          return res.redirect('/auth/login');
        });
        return;
      }

      if (user.status === 'blocked') {
        req.session.destroy(() => {
          return res.status(403).render('pages/error', {
            title: 'Acceso Bloqueado',
            message: 'Tu cuenta ha sido bloqueada debido a múltiples intentos fallidos de inicio de sesión. Contacta a un administrador.',
            user: null
          });
        });
        return;
      }

      if (user.status === 'inactive') {
        req.session.destroy(() => {
          return res.status(403).render('pages/error', {
            title: 'Cuenta Inactiva',
            message: 'Tu cuenta está inactiva. Contacta a un administrador.',
            user: null
          });
        });
        return;
      }

      req.user = user;
      res.locals.user = user; // Available in EJS views
      return next();
    } catch (error) {
      return next(error);
    }
  }

  // If request expects JSON (like API calls), return 401
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['sec-fetch-mode'] === 'cors' || req.method !== 'GET') {
    return res.status(401).json({
      success: false,
      message: 'No autorizado. Debe iniciar sesión.'
    });
  }

  return res.redirect('/auth/login');
};
