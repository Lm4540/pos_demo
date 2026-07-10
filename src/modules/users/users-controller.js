const { User, Branch, AuditLog } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { Op } = require('sequelize');

const listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      include: [{ model: Branch, as: 'branch' }],
      order: [['id', 'ASC']]
    });
    const branches = await Branch.findAll({ order: [['name', 'ASC']] });

    const checkPermission = require('../../core/middlewares/checkPermission');
    const rolePermissions = checkPermission.getRolePermissions();

    const permissionLabels = {
      'auth.session': 'Ver/Gestionar Sesiones',
      'auth.webauthn': 'Configurar WebAuthn (Biometría)',
      'users.block_unblock': 'Bloquear / Desbloquear Usuarios',
      'inventory.view': 'Ver Stock y Lotes',
      'inventory.adjust': 'Ajuste de Inventario (Mermas)',
      'cashier.open_turn': 'Abrir Turno de Caja',
      'cashier.movement': 'Registrar Depósitos / Retiros de Caja',
      'cashier.close_own_turn': 'Cerrar Turno de Caja Propio',
      'cashier.force_close_turn': 'Forzar Cierre de Turno Ajeno',
      'pos.sell_cash': 'Vender al Contado',
      'pos.sell_credit': 'Vender al Crédito',
      'pos.discount': 'Aplicar Descuento al Total',
      'pos.void_sale': 'Anular Ticket / Venta',
      'pos.open_drawer': 'Abrir Cajón de Dinero (Manualmente)',
      'cxc.create_client': 'Registrar Clientes',
      'cxc.add_payment': 'Registrar Abonos a Créditos',
      'purchases.create': 'Registrar Compras (Abastecimiento)',
      'purchases.create_batches': 'Generar Lotes y Vencimientos',
      'expenses.create': 'Registrar Gastos Operativos',
      'reports.local_dashboard': 'Ver Dashboard (Reporte Local)',
      'reports.ticket_history': 'Historial de Tickets'
    };

    return res.render('pages/users/index', {
      title: 'Usuarios',
      users,
      branches,
      rolePermissions,
      permissionLabels,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const renderUserIndexWithError = async (res, errorMsg) => {
  const { User, Branch } = require('../../core/models');
  const users = await User.findAll({
    include: [{ model: Branch, as: 'branch' }],
    order: [['id', 'ASC']]
  });
  const branches = await Branch.findAll({ order: [['name', 'ASC']] });

  const checkPermission = require('../../core/middlewares/checkPermission');
  const rolePermissions = checkPermission.getRolePermissions();

  const permissionLabels = {
    'auth.session': 'Ver/Gestionar Sesiones',
    'auth.webauthn': 'Configurar WebAuthn (Biometría)',
    'users.block_unblock': 'Bloquear / Desbloquear Usuarios',
    'inventory.view': 'Ver Stock y Lotes',
    'inventory.adjust': 'Ajuste de Inventario (Mermas)',
    'cashier.open_turn': 'Abrir Turno de Caja',
    'cashier.movement': 'Registrar Depósitos / Retiros de Caja',
    'cashier.close_own_turn': 'Cerrar Turno de Caja Propio',
    'cashier.force_close_turn': 'Forzar Cierre de Turno Ajeno',
    'pos.sell_cash': 'Vender al Contado',
    'pos.sell_credit': 'Vender al Crédito',
    'pos.discount': 'Aplicar Descuento al Total',
    'pos.void_sale': 'Anular Ticket / Venta',
    'pos.open_drawer': 'Abrir Cajón de Dinero (Manualmente)',
    'cxc.create_client': 'Registrar Clientes',
    'cxc.add_payment': 'Registrar Abonos a Créditos',
    'purchases.create': 'Registrar Compras (Abastecimiento)',
    'purchases.create_batches': 'Generar Lotes y Vencimientos',
    'expenses.create': 'Registrar Gastos Operativos',
    'reports.local_dashboard': 'Ver Dashboard (Reporte Local)',
    'reports.ticket_history': 'Historial de Tickets'
  };

  return res.render('pages/users/index', {
    title: 'Usuarios',
    users,
    branches,
    rolePermissions,
    permissionLabels,
    error: errorMsg
  });
};

const createUser = async (req, res, next) => {
  const { branchId, roleId, username, password, fullName, status, permissions } = req.body;
  try {
    if (!username || !password || !fullName || !roleId) {
      return await renderUserIndexWithError(res, 'Todos los campos marcados con * son obligatorios.');
    }

    const { sequelize } = require('../../core/models');

    // Validar de forma insensible a mayúsculas/minúsculas
    const existingUser = await User.findOne({
      where: sequelize.where(
        sequelize.fn('lower', sequelize.col('username')),
        username.trim().toLowerCase()
      )
    });
    if (existingUser) {
      return await renderUserIndexWithError(res, 'El nombre de usuario ya se encuentra registrado.');
    }

    // Process specialPermissions 3-way radio buttons
    const specialPermissions = {};
    if (permissions) {
      Object.keys(permissions).forEach(perm => {
        const val = permissions[perm];
        if (val === 'allow') {
          specialPermissions[perm] = true;
        } else if (val === 'deny') {
          specialPermissions[perm] = false;
        }
      });
    }

    const newUser = await User.create({
      branchId: branchId === '' ? null : parseInt(branchId, 10),
      roleId,
      username: username.trim(),
      passwordHash: password, // Will be hashed by hook
      fullName,
      status: status || 'active',
      specialPermissions
    });

    await logAction({
      userId: req.user.id,
      branchId: newUser.branchId,
      action: 'users.created',
      details: { username: newUser.username, roleId, fullName },
      ipAddress: req.ip
    });

    return res.redirect('/users?success=1');
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return await renderUserIndexWithError(res, 'El nombre de usuario ya se encuentra registrado.');
    }
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const { branchId, roleId, username, password, fullName, status, permissions } = req.body;

  try {
    const userToEdit = await User.findByPk(id);
    if (!userToEdit) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const previousStatus = userToEdit.status;
    const { sequelize } = require('../../core/models');

    // Validar nombre de usuario duplicado (insensible a mayúsculas/minúsculas) exceptuando al usuario mismo
    if (username && username.trim() !== '') {
      const existingUser = await User.findOne({
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn('lower', sequelize.col('username')),
              username.trim().toLowerCase()
            ),
            { id: { [Op.ne]: userToEdit.id } }
          ]
        }
      });
      if (existingUser) {
        return await renderUserIndexWithError(res, 'El nombre de usuario ya está registrado por otro usuario.');
      }
    }

    // Process specialPermissions 3-way radio buttons
    const specialPermissions = {};
    if (permissions) {
      Object.keys(permissions).forEach(perm => {
        const val = permissions[perm];
        if (val === 'allow') {
          specialPermissions[perm] = true;
        } else if (val === 'deny') {
          specialPermissions[perm] = false;
        }
      });
    }

    const updatePayload = {
      branchId: branchId === '' ? null : parseInt(branchId, 10),
      roleId,
      username: username ? username.trim() : userToEdit.username,
      fullName,
      status,
      specialPermissions
    };

    if (password && password.trim() !== '') {
      updatePayload.passwordHash = password; // Hashed by hook
    }

    const transaction = await sequelize.transaction();

    try {
      await userToEdit.update(updatePayload, { transaction });

      // If status changed to blocked or inactive, immediately expel them by deleting all active database sessions
      if ((status === 'blocked' || status === 'inactive') && previousStatus !== status) {
        await sequelize.query('DELETE FROM sessions WHERE userId = ?', {
          replacements: [userToEdit.id],
          transaction
        });
      }

      await transaction.commit();

      // Log action AFTER committing the transaction to release table locks first!
      await logAction({
        userId: req.user.id,
        branchId: userToEdit.branchId,
        action: 'users.updated',
        details: { username: updatePayload.username, roleId, fullName, status },
        ipAddress: req.ip
      });

      return res.redirect('/users?success=1');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return await renderUserIndexWithError(res, 'El nombre de usuario ya está registrado por otro usuario.');
    }
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  const { id } = req.params;
  try {
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: 'No puedes eliminar tu propio usuario.' });
    }

    const userToEdit = await User.findByPk(id);
    if (!userToEdit) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    await userToEdit.destroy();

    // Expel user sessions on deletion
    const { sequelize } = require('../../core/models');
    await sequelize.query('DELETE FROM sessions WHERE userId = ?', {
      replacements: [id]
    });

    await logAction({
      userId: req.user.id,
      branchId: userToEdit.branchId,
      action: 'users.deleted',
      details: { username: userToEdit.username },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Usuario eliminado correctamente.' });
  } catch (error) {
    return next(error);
  }
};

const updateRolePermissions = async (req, res, next) => {
  const { supervisor, cashier } = req.body;
  try {
    const fs = require('fs');
    const path = require('path');
    const rolePermissionsPath = path.join(__dirname, '../../config/role-permissions.json');

    const newPermissions = {
      supervisor: Array.isArray(supervisor) ? supervisor : (supervisor ? [supervisor] : []),
      cashier: Array.isArray(cashier) ? cashier : (cashier ? [cashier] : [])
    };

    fs.writeFileSync(rolePermissionsPath, JSON.stringify(newPermissions, null, 2), 'utf8');

    // Reload checkPermission matrix dynamically
    const checkPermission = require('../../core/middlewares/checkPermission');
    if (checkPermission.reloadRolePermissions) {
      checkPermission.reloadRolePermissions();
    }

    await logAction({
      userId: req.user.id,
      action: 'users.role_permissions_updated',
      details: { supervisorCount: newPermissions.supervisor.length, cashierCount: newPermissions.cashier.length },
      ipAddress: req.ip
    });

    return res.redirect('/users?success=1');
  } catch (error) {
    return next(error);
  }
};

const viewAuditLogs = async (req, res, next) => {
  try {
    let { userId, branchId, action, startDate, endDate, page } = req.query;
    page = parseInt(page, 10) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const where = {};
    if (userId && userId !== 'all') {
      where.userId = parseInt(userId, 10);
    }
    if (branchId && branchId !== 'all') {
      where.branchId = parseInt(branchId, 10);
    }
    if (action && action.trim() !== '') {
      where.action = { [Op.like]: `%${action.trim()}%` };
    }
    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
      };
    }

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['fullName', 'username'] },
        { model: Branch, as: 'branch', attributes: ['name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const allUsers = await User.findAll({ order: [['fullName', 'ASC']] });
    const allBranches = await Branch.findAll({ order: [['name', 'ASC']] });

    const totalPages = Math.ceil(count / limit);

    return res.render('pages/users/audit', {
      title: 'Bitácora de Auditoría',
      logs,
      allUsers,
      allBranches,
      selectedUserId: userId || 'all',
      selectedBranchId: branchId || 'all',
      selectedAction: action || '',
      startDate: startDate || '',
      endDate: endDate || '',
      currentPage: page,
      totalPages,
      totalCount: count
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  updateRolePermissions,
  viewAuditLogs
};
