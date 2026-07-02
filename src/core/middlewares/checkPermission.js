const fs = require('fs');
const path = require('path');

let ROLE_PERMISSIONS = {};
const rolePermissionsPath = path.join(__dirname, '../../config/role-permissions.json');

const loadRolePermissions = () => {
  try {
    if (fs.existsSync(rolePermissionsPath)) {
      ROLE_PERMISSIONS = JSON.parse(fs.readFileSync(rolePermissionsPath, 'utf8'));
    } else {
      ROLE_PERMISSIONS = {
        supervisor: [
          'auth.session',
          'auth.webauthn',
          'users.block_unblock',
          'inventory.view',
          'inventory.adjust',
          'cashier.open_turn',
          'cashier.movement',
          'cashier.close_own_turn',
          'cashier.force_close_turn',
          'pos.sell_cash',
          'pos.sell_credit',
          'pos.discount',
          'pos.void_sale',
          'cxc.create_client',
          'cxc.add_payment',
          'purchases.create',
          'purchases.create_batches',
          'expenses.create',
          'reports.local_dashboard',
          'reports.ticket_history'
        ],
        cashier: [
          'auth.session',
          'auth.webauthn',
          'inventory.view',
          'cashier.open_turn',
          'cashier.movement',
          'cashier.close_own_turn',
          'pos.sell_cash',
          'pos.sell_credit',
          'cxc.create_client',
          'cxc.add_payment',
          'reports.ticket_history'
        ]
      };
      fs.writeFileSync(rolePermissionsPath, JSON.stringify(ROLE_PERMISSIONS, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error loading role permissions:', error);
  }
};

// Initial load
loadRolePermissions();

const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(401).json({ success: false, message: 'No autenticado.' });
      }
      return res.redirect('/auth/login');
    }

    const { roleId, specialPermissions } = user;

    // 1. Admins have access to everything
    if (roleId === 'admin') {
      return next();
    }

    // 2. Check specialPermissions exceptions first (override role)
    if (specialPermissions && specialPermissions[requiredPermission] !== undefined) {
      if (specialPermissions[requiredPermission] === true) {
        return next();
      } else {
        return deny(req, res);
      }
    }

    // 3. Fallback to Role permissions matrix
    const allowedPermissions = ROLE_PERMISSIONS[roleId] || [];
    if (allowedPermissions.includes(requiredPermission)) {
      return next();
    }

    return deny(req, res);
  };
};

function deny(req, res) {
  const message = 'Acceso denegado. No tienes los permisos necesarios para realizar esta acción.';
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['sec-fetch-mode'] === 'cors' || req.method !== 'GET') {
    return res.status(403).json({
      success: false,
      message
    });
  }
  return res.status(403).render('pages/error', {
    title: 'Acceso Denegado',
    message,
    user: req.user
  });
}

module.exports = checkPermission;
module.exports.getRolePermissions = () => ROLE_PERMISSIONS;
module.exports.reloadRolePermissions = loadRolePermissions;
