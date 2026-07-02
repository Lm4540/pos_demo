const { Category } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      order: [['name', 'ASC']]
    });
    return res.render('pages/inventory/categories', {
      title: 'Categorías de Productos',
      categories,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createCategory = async (req, res, next) => {
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    return res.render('pages/inventory/categories', {
      title: 'Categorías de Productos',
      categories,
      error: 'El nombre de la categoría es obligatorio.'
    });
  }

  try {
    const newCategory = await Category.create({
      name: name.trim(),
      description: description && description.trim() !== '' ? description.trim() : null
    });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.category_created',
      details: { name: newCategory.name, categoryId: newCategory.id },
      ipAddress: req.ip
    });

    return res.redirect('/categories?success=1');
  } catch (error) {
    return next(error);
  }
};

const updateCategory = async (req, res, next) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio.' });
  }

  try {
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada.' });
    }

    await category.update({
      name: name.trim(),
      description: description && description.trim() !== '' ? description.trim() : null
    });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.category_updated',
      details: { name: category.name, categoryId: category.id },
      ipAddress: req.ip
    });

    return res.redirect('/categories?success=1');
  } catch (error) {
    return next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  const { id } = req.params;

  try {
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada.' });
    }

    // Opcional: Podríamos verificar si hay productos asignados a esta categoría
    const { Product } = require('../../core/models');
    const productsCount = await Product.count({ where: { categoryId: id } });
    if (productsCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `No se puede eliminar la categoría porque tiene ${productsCount} producto(s) asignado(s).` 
      });
    }

    await category.destroy();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.category_deleted',
      details: { name: category.name, categoryId: category.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Categoría eliminada correctamente.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
