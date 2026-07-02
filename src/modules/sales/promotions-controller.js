const { Promotion, Product, Category } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listPromotions = async (req, res, next) => {
  try {
    const promotions = await Promotion.findAll({
      include: [
        { model: Product, as: 'product' },
        { model: Category, as: 'category' }
      ],
      order: [['createdAt', 'DESC']]
    });

    const products = await Product.findAll({ order: [['name', 'ASC']] });
    const categories = await Category.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/sales/promotions', {
      title: 'Promociones y Descuentos',
      promotions,
      products,
      categories,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createPromotion = async (req, res, next) => {
  const { name, description, type, value, buyQty, payQty, startDate, endDate, productId, categoryId } = req.body;

  try {
    const errorRedirect = async (msg) => {
      const promotions = await Promotion.findAll({
        include: [
          { model: Product, as: 'product' },
          { model: Category, as: 'category' }
        ],
        order: [['createdAt', 'DESC']]
      });
      const products = await Product.findAll({ order: [['name', 'ASC']] });
      const categories = await Category.findAll({ order: [['name', 'ASC']] });
      return res.render('pages/sales/promotions', {
        title: 'Promociones y Descuentos',
        promotions,
        products,
        categories,
        error: msg
      });
    };

    if (!name || name.trim() === '') {
      return errorRedirect('El nombre de la promoción es obligatorio.');
    }

    if (!type || !['percentage', 'fixed_price', 'bulk'].includes(type)) {
      return errorRedirect('El tipo de promoción no es válido.');
    }

    if (!productId && !categoryId) {
      return errorRedirect('Debe seleccionar un producto o una categoría aplicable para la promoción.');
    }

    const payload = {
      name: name.trim(),
      description: description && description.trim() !== '' ? description.trim() : null,
      type,
      productId: productId && productId !== '' ? parseInt(productId, 10) : null,
      categoryId: categoryId && categoryId !== '' ? parseInt(categoryId, 10) : null,
      startDate: startDate && startDate !== '' ? startDate : null,
      endDate: endDate && endDate !== '' ? endDate : null,
      isActive: req.body.isActive === 'true' || req.body.isActive === true
    };

    if (type === 'bulk') {
      const bQty = parseInt(buyQty, 10);
      const pQty = parseInt(payQty, 10);
      if (isNaN(bQty) || bQty <= 1 || isNaN(pQty) || pQty <= 0 || pQty >= bQty) {
        return errorRedirect('Para promociones de volumen (bulk), "Lleva" debe ser mayor a 1, y "Paga" debe ser un número entero mayor a 0 y menor a "Lleva". (Ej: Lleva 3, Paga 2)');
      }
      payload.buyQty = bQty;
      payload.payQty = pQty;
      payload.value = null;
    } else {
      const val = parseFloat(value);
      if (isNaN(val) || val <= 0) {
        return errorRedirect('El valor del descuento debe ser un número válido mayor a cero.');
      }
      if (type === 'percentage' && val > 100) {
        return errorRedirect('El porcentaje de descuento no puede ser superior al 100%.');
      }
      payload.value = val;
      payload.buyQty = null;
      payload.payQty = null;
    }

    const newPromotion = await Promotion.create(payload);

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'sales.promotion_created',
      details: { name: newPromotion.name, promotionId: newPromotion.id, type },
      ipAddress: req.ip
    });

    return res.redirect('/promotions?success=1');
  } catch (error) {
    return next(error);
  }
};

const updatePromotion = async (req, res, next) => {
  const { id } = req.params;
  const { name, description, type, value, buyQty, payQty, startDate, endDate, productId, categoryId } = req.body;

  try {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) {
      return res.status(404).json({ success: false, message: 'Promoción no encontrada.' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre de la promoción es obligatorio.' });
    }

    if (!type || !['percentage', 'fixed_price', 'bulk'].includes(type)) {
      return res.status(400).json({ success: false, message: 'El tipo de promoción no es válido.' });
    }

    if (!productId && !categoryId) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar un producto o una categoría aplicable.' });
    }

    const payload = {
      name: name.trim(),
      description: description && description.trim() !== '' ? description.trim() : null,
      type,
      productId: productId && productId !== '' ? parseInt(productId, 10) : null,
      categoryId: categoryId && categoryId !== '' ? parseInt(categoryId, 10) : null,
      startDate: startDate && startDate !== '' ? startDate : null,
      endDate: endDate && endDate !== '' ? endDate : null,
      isActive: req.body.isActive === 'true' || req.body.isActive === true
    };

    if (type === 'bulk') {
      const bQty = parseInt(buyQty, 10);
      const pQty = parseInt(payQty, 10);
      if (isNaN(bQty) || bQty <= 1 || isNaN(pQty) || pQty <= 0 || pQty >= bQty) {
        return res.status(400).json({ success: false, message: 'Configuración de volumen (bulk) inválida.' });
      }
      payload.buyQty = bQty;
      payload.payQty = pQty;
      payload.value = null;
    } else {
      const val = parseFloat(value);
      if (isNaN(val) || val <= 0) {
        return res.status(400).json({ success: false, message: 'El valor de descuento debe ser mayor a cero.' });
      }
      if (type === 'percentage' && val > 100) {
        return res.status(400).json({ success: false, message: 'El porcentaje no puede ser superior al 100%.' });
      }
      payload.value = val;
      payload.buyQty = null;
      payload.payQty = null;
    }

    await promotion.update(payload);

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'sales.promotion_updated',
      details: { name: promotion.name, promotionId: promotion.id, type },
      ipAddress: req.ip
    });

    return res.redirect('/promotions?success=1');
  } catch (error) {
    return next(error);
  }
};

const deletePromotion = async (req, res, next) => {
  const { id } = req.params;

  try {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) {
      return res.status(404).json({ success: false, message: 'Promoción no encontrada.' });
    }

    await promotion.destroy();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'sales.promotion_deleted',
      details: { name: promotion.name, promotionId: promotion.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Promoción eliminada correctamente.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion
};
