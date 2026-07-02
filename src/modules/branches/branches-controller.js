const { Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listBranches = async (req, res, next) => {
  try {
    const branches = await Branch.findAll({ order: [['id', 'ASC']] });
    return res.render('pages/branches/index', {
      title: 'Sucursales',
      branches,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createBranch = async (req, res, next) => {
  const { name, address, phone } = req.body;
  try {
    if (!name || name.trim() === '') {
      const branches = await Branch.findAll({ order: [['id', 'ASC']] });
      return res.render('pages/branches/index', {
        title: 'Sucursales',
        branches,
        error: 'El nombre de la sucursal es obligatorio.'
      });
    }

    const branch = await Branch.create({ name, address, phone });

    await logAction({
      userId: req.user.id,
      branchId: branch.id,
      action: 'branches.created',
      details: { name, address, phone },
      ipAddress: req.ip
    });

    return res.redirect('/branches?success=1');
  } catch (error) {
    return next(error);
  }
};

const updateBranch = async (req, res, next) => {
  const { id } = req.params;
  const { name, address, phone } = req.body;
  try {
    const branch = await Branch.findByPk(id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Sucursal no encontrada.' });
    }

    await branch.update({ name, address, phone });

    await logAction({
      userId: req.user.id,
      branchId: branch.id,
      action: 'branches.updated',
      details: { name, address, phone },
      ipAddress: req.ip
    });

    return res.redirect('/branches?success=1');
  } catch (error) {
    return next(error);
  }
};

const deleteBranch = async (req, res, next) => {
  const { id } = req.params;
  try {
    const branch = await Branch.findByPk(id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Sucursal no encontrada.' });
    }

    // Check if it's the only branch left
    const branchCount = await Branch.count();
    if (branchCount <= 1) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar la única sucursal activa del sistema.' });
    }

    await branch.destroy();

    await logAction({
      userId: req.user.id,
      branchId: id,
      action: 'branches.deleted',
      details: { name: branch.name },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Sucursal eliminada correctamente.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch
};
