const { Product, Category, sequelize } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const fs = require('fs');
const path = require('path');

const listProducts = async (req, res, next) => {
  try {
    const { BranchProduct } = require('../../core/models');
    const products = await Product.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: BranchProduct,
          as: 'branchProducts',
          where: { branchId: req.user.branchId },
          required: false
        },
        {
          model: Category,
          as: 'category'
        }
      ]
    });
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    return res.render('pages/products/index', {
      title: 'Catálogo de Productos',
      products,
      categories,
      error: null,
      maxPx: process.env.IMG_MAX_PX || 1200,
      quality: process.env.IMG_QUALITY || 0.8
    });
  } catch (error) {
    return next(error);
  }
};

const saveImageFromBase64OrUrl = async (imageBase64, imageUrl) => {
  const crypto = require('crypto');
  const uploadDir = path.join(__dirname, '../../../storage/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Handle Base64 from clipboard
  if (imageBase64 && imageBase64.trim() !== '') {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const ext = matches[1].split('/')[1] || 'png';
      const buffer = Buffer.from(matches[2], 'base64');
      const filename = `pasted_${crypto.randomBytes(16).toString('hex')}.${ext}`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);
      return '/uploads/' + filename;
    }
  }

  // Handle Image URL
  if (imageUrl && imageUrl.trim() !== '') {
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/png';
        const ext = contentType.split('/')[1] || 'png';
        const filename = `url_${crypto.randomBytes(16).toString('hex')}.${ext}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        return '/uploads/' + filename;
      }
    } catch (urlErr) {
      console.error('Failed to download image from URL:', urlErr.message);
    }
  }

  return null;
};

const createProduct = async (req, res, next) => {
  const { barCode, name, isFrequent, categoryId, type, imageBase64, imageUrl } = req.body;
  let imagePath = null;
  
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  } else {
    const savedPath = await saveImageFromBase64OrUrl(imageBase64, imageUrl);
    if (savedPath) {
      imagePath = savedPath;
    }
  }

  try {
    if (!name || name.trim() === '') {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({ success: false, message: 'El nombre del producto es obligatorio.' });
      }
      const products = await Product.findAll({ order: [['name', 'ASC']] });
      const categories = await Category.findAll({ order: [['name', 'ASC']] });
      return res.render('pages/products/index', {
        title: 'Catálogo de Productos',
        products,
        categories,
        error: 'El nombre del producto es obligatorio.',
        maxPx: process.env.IMG_MAX_PX || 1200,
        quality: process.env.IMG_QUALITY || 0.8
      });
    }

    const newProduct = await Product.create({
      barCode: barCode && barCode.trim() !== '' ? barCode.trim() : null,
      name: name.trim(),
      isFrequent: isFrequent === 'true',
      type: type || 'physical',
      imagePath,
      categoryId: categoryId && categoryId !== '' ? parseInt(categoryId, 10) : null
    });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.product_created',
      details: { name: newProduct.name, barCode: newProduct.barCode },
      ipAddress: req.ip
    });

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Producto registrado con éxito.', product: newProduct });
    }
    return res.redirect('/products?success=1');
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(400).json({ success: false, message: 'El código de barras ya se encuentra asignado a otro producto.' });
      }
      const products = await Product.findAll({ order: [['name', 'ASC']] });
      const categories = await Category.findAll({ order: [['name', 'ASC']] });
      return res.render('pages/products/index', {
        title: 'Catálogo de Productos',
        products,
        categories,
        error: 'El código de barras ya se encuentra asignado a otro producto.',
        maxPx: process.env.IMG_MAX_PX || 1200,
        quality: process.env.IMG_QUALITY || 0.8
      });
    }
    return next(error);
  }
};

const updateProduct = async (req, res, next) => {
  const { id } = req.params;
  const { barCode, name, isFrequent, categoryId, type, imageBase64, imageUrl } = req.body;
  let imagePath = null;
  
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  } else {
    const savedPath = await saveImageFromBase64OrUrl(imageBase64, imageUrl);
    if (savedPath) {
      imagePath = savedPath;
    }
  }

  try {
    const product = await Product.findByPk(id);
    if (!product) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    const updatePayload = {
      barCode: barCode && barCode.trim() !== '' ? barCode.trim() : null,
      name: name.trim(),
      isFrequent: isFrequent === 'true',
      type: type || 'physical',
      categoryId: categoryId && categoryId !== '' ? parseInt(categoryId, 10) : null
    };

    if (imagePath) {
      if (product.imagePath) {
        const oldPath = path.join(__dirname, '../../../storage', product.imagePath.replace('/uploads/', 'uploads/'));
        try { fs.unlinkSync(oldPath); } catch(e) {}
      }
      updatePayload.imagePath = imagePath;
    }

    await product.update(updatePayload);

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.product_updated',
      details: { name: product.name, barCode: product.barCode },
      ipAddress: req.ip
    });

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Producto actualizado con éxito.', product });
    }
    return res.redirect('/products?success=1');
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    return next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  const { id } = req.params;
  try {
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    await product.destroy();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.product_deleted',
      details: { name: product.name },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Producto eliminado correctamente del catálogo.' });
  } catch (error) {
    return next(error);
  }
};

const listBatches = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { ProductBatch } = require('../../core/models');
    const { Op } = require('sequelize');

    const batches = await ProductBatch.findAll({
      where: {
        productId: id,
        branchId: req.user.branchId,
        currentQuantity: { [Op.gt]: 0 }
      },
      order: [['expirationDate', 'ASC']]
    });

    return res.json(batches);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adjustInventory = async (req, res, next) => {
  const { id } = req.params;
  const { batchId, quantity, reason } = req.body;

  try {
    const { ProductBatch, BranchProduct, sequelize } = require('../../core/models');

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: 'La cantidad debe ser un número entero mayor a cero.' });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Debe especificar la justificación del ajuste.' });
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    const transaction = await sequelize.transaction();

    try {
      const batch = await ProductBatch.findOne({
        where: {
          id: batchId,
          productId: id,
          branchId: req.user.branchId
        },
        transaction
      });

      if (!batch || batch.currentQuantity < parsedQty) {
        throw new Error('Lote no encontrado o stock insuficiente en el lote seleccionado.');
      }

      const branchProduct = await BranchProduct.findOne({
        where: {
          productId: id,
          branchId: req.user.branchId
        },
        transaction
      });

      if (!branchProduct || branchProduct.totalStock < parsedQty) {
        throw new Error('Stock total insuficiente en la sucursal.');
      }

      const { logKardex } = require('./kardexService');
      await logKardex({
        productId: id,
        branchId: req.user.branchId,
        userId: req.user.id,
        quantity: parsedQty,
        isInput: false,
        type: 'adjustment',
        description: `Merma/Daño - Motivo: ${reason.trim()}`,
        transaction
      });

      batch.currentQuantity -= parsedQty;
      await batch.save({ transaction });

      branchProduct.totalStock -= parsedQty;
      await branchProduct.save({ transaction });

      await transaction.commit();

      await logAction({
        userId: req.user.id,
        branchId: req.user.branchId,
        action: 'inventory.adjust',
        details: {
          productId: id,
          productName: product.name,
          batchId,
          batchCode: batch.batchCode,
          quantityRemoved: parsedQty,
          reason: reason.trim()
        },
        ipAddress: req.ip
      });

      return res.json({ success: true, message: 'Ajuste de inventario registrado correctamente.' });
    } catch (err) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: err.message });
    }
  } catch (error) {
    return next(error);
  }
};

const renderKardex = async (req, res, next) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const { Kardex, Product, User, Branch } = require('../../core/models');
    const { Op } = require('sequelize');

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Producto no encontrado.',
        user: req.user
      });
    }

    const whereClause = { productId: id };
    
    if (req.user.roleId !== 'admin') {
      whereClause.branchId = req.user.branchId;
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
      };
    }

    const logs = await Kardex.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user' },
        { model: Branch, as: 'branch' }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.render('pages/products/kardex', {
      title: `Kardex - ${product.name}`,
      product,
      logs,
      startDate: startDate || '',
      endDate: endDate || ''
    });
  } catch (error) {
    return next(error);
  }
};

const renderServiceMovements = async (req, res, next) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const { SaleDetail, Sale, Product, User, Branch } = require('../../core/models');
    const { Op } = require('sequelize');

    const product = await Product.findByPk(id);
    if (!product || product.type !== 'service') {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Servicio no encontrado.',
        user: req.user
      });
    }

    const detailsWhere = { productId: id };
    const saleIncludeWhere = {};

    if (req.user.roleId !== 'admin') {
      saleIncludeWhere.branchId = req.user.branchId;
    }

    if (startDate && endDate) {
      saleIncludeWhere.createdAt = {
        [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
      };
    }

    const movements = await SaleDetail.findAll({
      where: detailsWhere,
      include: [
        {
          model: Sale,
          as: 'sale',
          where: saleIncludeWhere,
          required: true,
          include: [
            { model: User, as: 'user' },
            { model: Branch, as: 'branch' }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.render('pages/products/service-movements', {
      title: `Movimientos de Servicio - ${product.name}`,
      product,
      movements,
      startDate: startDate || '',
      endDate: endDate || ''
    });
  } catch (error) {
    return next(error);
  }
};

const updateBranchSettings = async (req, res, next) => {
  const { id } = req.params;
  const { salePrice, minStock } = req.body;
  const branchId = req.user.branchId;

  try {
    const { BranchProduct } = require('../../core/models');
    
    const parsedPrice = parseFloat(salePrice);
    const parsedMinStock = parseInt(minStock, 10);

    if (isNaN(parsedPrice) || parsedPrice < 0 || isNaN(parsedMinStock) || parsedMinStock < 0) {
      return res.status(400).json({ success: false, message: 'El precio y el stock mínimo deben ser números válidos mayores o iguales a cero.' });
    }

    let bp = await BranchProduct.findOne({
      where: { productId: id, branchId }
    });

    if (bp) {
      await bp.update({
        salePrice: parsedPrice,
        minStock: parsedMinStock
      });
    } else {
      await BranchProduct.create({
        productId: id,
        branchId,
        totalStock: 0,
        averageCost: 0.00,
        salePrice: parsedPrice,
        minStock: parsedMinStock
      });
    }

    await logAction({
      userId: req.user.id,
      branchId,
      action: 'inventory.product_branch_settings_updated',
      details: { productId: id, salePrice: parsedPrice, minStock: parsedMinStock },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Configuración de sucursal guardada correctamente.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const batchCreateProducts = async (req, res, next) => {
  const { baseName, categoryId, isFrequent, type, variants } = req.body;

  if (!baseName || baseName.trim() === '') {
    return res.status(400).json({ success: false, message: 'El nombre base es obligatorio.' });
  }

  if (!variants || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe ingresar al menos una variante.' });
  }

  const { Branch, BranchProduct } = require('../../core/models');
  const transaction = await sequelize.transaction();

  try {
    const createdProducts = [];
    const allBranches = await Branch.findAll({ transaction });

    for (const variant of variants) {
      const suffix = variant.suffix ? variant.suffix.trim() : '';
      const name = suffix ? `${baseName.trim()} (${suffix})` : baseName.trim();
      const barCode = variant.barCode ? variant.barCode.trim() : null;

      // Check unique barcode if provided
      if (barCode) {
        const existing = await Product.findOne({ where: { barCode }, transaction });
        if (existing) {
          throw new Error(`El código de barras "${barCode}" ya está asignado a otro producto.`);
        }
      }

      const product = await Product.create({
        name,
        barCode: barCode || null,
        type: type || 'physical',
        isFrequent: isFrequent === true || isFrequent === 'true',
        categoryId: categoryId ? parseInt(categoryId, 10) : null
      }, { transaction });

      // Initialize branch products with salePrice, averageCost, and totalStock
      const salePrice = parseFloat(variant.salePrice) || 0.00;
      const averageCost = parseFloat(variant.averageCost) || 0.00;
      const totalStock = parseInt(variant.totalStock, 10) || 0;

      for (const branch of allBranches) {
        await BranchProduct.create({
          productId: product.id,
          branchId: branch.id,
          totalStock: totalStock,
          averageCost: averageCost,
          salePrice: salePrice,
          minStock: 0
        }, { transaction });
      }

      createdProducts.push({ id: product.id, name: product.name, barCode: product.barCode });
    }

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.batch_products_created',
      details: { count: createdProducts.length, baseName },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `${createdProducts.length} variante(s) creadas correctamente.`, products: createdProducts });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const searchProductsApi = async (req, res, next) => {
  const { q } = req.query;
  const { Op } = require('sequelize');
  try {
    const query = q ? q.trim().toLowerCase() : '';
    const whereClause = query !== '' ? {
      [Op.or]: [
        sequelize.where(sequelize.fn('LOWER', sequelize.col('Product.name')), 'LIKE', `%${query}%`),
        sequelize.where(sequelize.fn('LOWER', sequelize.col('Product.barCode')), 'LIKE', `%${query}%`)
      ]
    } : {};

    const products = await Product.findAll({
      where: whereClause,
      limit: 20,
      order: [['name', 'ASC']]
    });

    return res.json({ success: true, products });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listBatches,
  adjustInventory,
  renderKardex,
  renderServiceMovements,
  updateBranchSettings,
  batchCreateProducts,
  searchProductsApi
};
