const { Supplier } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listSuppliers = async (req, res, next) => {
  try {
    const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });
    return res.render('pages/suppliers/index', {
      title: 'Proveedores',
      suppliers,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createSupplier = async (req, res, next) => {
  const { name, phone, address } = req.body;
  try {
    if (!name || name.trim() === '') {
      const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });
      return res.render('pages/suppliers/index', {
        title: 'Proveedores',
        suppliers,
        error: 'El nombre del proveedor es obligatorio.'
      });
    }

    const supplier = await Supplier.create({ name, phone, address });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'suppliers.created',
      details: { name, phone, address },
      ipAddress: req.ip
    });

    return res.redirect('/suppliers?success=1');
  } catch (error) {
    return next(error);
  }
};

const updateSupplier = async (req, res, next) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;
  try {
    const supplier = await Supplier.findByPk(id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
    }

    await supplier.update({ name, phone, address });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'suppliers.updated',
      details: { name, phone, address },
      ipAddress: req.ip
    });

    return res.redirect('/suppliers?success=1');
  } catch (error) {
    return next(error);
  }
};

const deleteSupplier = async (req, res, next) => {
  const { id } = req.params;
  try {
    const supplier = await Supplier.findByPk(id);
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Proveedor no encontrado.' });
    }

    await supplier.destroy();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'suppliers.deleted',
      details: { name: supplier.name },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Proveedor eliminado correctamente.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
};
