const { ErrorLog, User, Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listErrors = async (req, res, next) => {
  try {
    const errorLogs = await ErrorLog.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'fullName'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 300
    });

    return res.render('pages/errors/index', {
      title: 'Registro de Errores del Sistema',
      errorLogs,
      user: req.user
    });
  } catch (error) {
    return next(error);
  }
};

const getErrorDetailApi = async (req, res, next) => {
  const { id } = req.params;
  try {
    const errorLog = await ErrorLog.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'fullName'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] }
      ]
    });

    if (!errorLog) {
      return res.status(404).json({ success: false, message: 'Registro de error no encontrado.' });
    }

    return res.json({ success: true, errorLog });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteError = async (req, res, next) => {
  const { id } = req.params;
  try {
    const errorLog = await ErrorLog.findByPk(id);
    if (!errorLog) {
      return res.status(404).json({ success: false, message: 'Registro de error no encontrado.' });
    }

    await errorLog.destroy();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'system.error_log_deleted',
      details: { errorLogId: id, errorMessage: errorLog.errorMessage },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Registro de error eliminado permanentemente.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const clearAllErrors = async (req, res, next) => {
  try {
    const count = await ErrorLog.count();
    await ErrorLog.destroy({ where: {}, truncate: false });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'system.all_error_logs_cleared',
      details: { clearedCount: count },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `Se han eliminado los ${count} registros de errores del sistema.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listErrors,
  getErrorDetailApi,
  deleteError,
  clearAllErrors
};
