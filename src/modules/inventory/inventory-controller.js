const { 
  InventoryAudit, 
  InventoryAuditDetail, 
  Branch, 
  User, 
  Product, 
  BranchProduct, 
  AuditLog, 
  sequelize 
} = require('../../core/models');
const { logKardex } = require('./kardexService');
const { Op } = require('sequelize');

// Render Audits List
async function renderAuditsIndex(req, res, next) {
  try {
    const isSuperOrCashier = ['supervisor', 'cashier'].includes(req.user.roleId);
    const branchId = isSuperOrCashier ? req.user.branchId : (req.query.branchId || null);

    const whereClause = {};
    if (branchId) {
      whereClause.branchId = branchId;
    }

    const audits = await InventoryAudit.findAll({
      where: whereClause,
      include: [
        { model: Branch, as: 'branch' },
        { model: User, as: 'user' }
      ],
      order: [['createdAt', 'DESC']]
    });

    const branches = await Branch.findAll();

    res.render('pages/inventory/audits-index', {
      title: 'Auditorías de Inventario',
      user: req.user,
      audits,
      branches,
      selectedBranchId: branchId,
      successMessage: req.query.success === '1' ? 'Operación realizada con éxito.' : null
    });
  } catch (err) {
    next(err);
  }
}

// Create new Audit session
async function handleCreateAudit(req, res, next) {
  try {
    const branchId = req.body.branchId || req.user.branchId;
    const sector = req.body.sector ? req.body.sector.trim() : 'General';

    if (!branchId) {
      return res.redirect('/inventory/audits?error=Seleccione una sucursal');
    }

    const audit = await InventoryAudit.create({
      branchId,
      userId: req.user.id,
      sector,
      status: 'draft'
    });

    // Audit log
    await AuditLog.create({
      userId: req.user.id,
      branchId: req.user.branchId || null,
      action: 'inventory.audit_created',
      details: JSON.stringify({ auditId: audit.id, sector, branchId }),
      ipAddress: req.ip
    });

    res.redirect(`/inventory/audits/${audit.id}?success=1`);
  } catch (err) {
    next(err);
  }
}

// Render Audit Session Counting Sheet
async function renderAuditCount(req, res, next) {
  try {
    const audit = await InventoryAudit.findByPk(req.params.id, {
      include: [
        { model: Branch, as: 'branch' },
        { model: User, as: 'user' },
        { 
          model: InventoryAuditDetail, 
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!audit) {
      return res.redirect('/inventory/audits?error=Auditoría no encontrada');
    }

    if (['supervisor', 'cashier'].includes(req.user.roleId) && audit.branchId !== req.user.branchId) {
      return res.redirect('/inventory/audits?error=No autorizado para esta sucursal');
    }

    if (audit.status === 'completed') {
      return res.redirect(`/inventory/audits/${audit.id}/report`);
    }

    res.render('pages/inventory/audits-count', {
      title: `Auditoría Física - Sector: ${audit.sector}`,
      user: req.user,
      audit
    });
  } catch (err) {
    next(err);
  }
}

// Load Current Stock items for autocomplete or templates
async function searchBranchProducts(req, res) {
  try {
    const q = req.query.q || '';
    const branchId = req.query.branchId || req.user.branchId;

    const results = await BranchProduct.findAll({
      where: { branchId },
      include: [{
        model: Product,
        as: 'product',
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%${q}%` } },
            { barCode: { [Op.like]: `%${q}%` } }
          ]
        }
      }],
      limit: 15
    });

    res.json(results.map(r => ({
      productId: r.productId,
      name: r.product.name,
      barCode: r.product.barCode || '',
      expectedQuantity: r.totalStock,
      averageCost: r.averageCost,
      salePrice: r.salePrice
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al buscar productos.' });
  }
}

// Load all branch products to template sheet
async function loadAllBranchProducts(req, res) {
  try {
    const { auditId } = req.body;
    const audit = await InventoryAudit.findByPk(auditId);
    if (!audit) {
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada' });
    }

    const items = await BranchProduct.findAll({
      where: { branchId: audit.branchId },
      include: [{ model: Product, as: 'product' }]
    });

    res.json(items.map(r => ({
      productId: r.productId,
      name: r.product.name,
      barCode: r.product.barCode || '',
      expectedQuantity: r.totalStock,
      averageCost: r.averageCost
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al cargar plantilla' });
  }
}

// Save Audit Draft (No stock changes)
async function handleSaveDraft(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { auditId, items } = req.body;
    const audit = await InventoryAudit.findByPk(auditId, { transaction });
    if (!audit) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada' });
    }

    if (audit.status === 'completed') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'La auditoría ya está finalizada.' });
    }

    // Clear old details
    await InventoryAuditDetail.destroy({
      where: { inventoryAuditId: auditId },
      transaction
    });

    // Re-insert detailed counts
    if (items && items.length > 0) {
      const records = items.map(item => {
        const expected = parseFloat(item.expectedQuantity) || 0;
        const counted = parseFloat(item.countedQuantity) || 0;
        const discrepancy = counted - expected;
        return {
          inventoryAuditId: auditId,
          productId: item.productId,
          expectedQuantity: expected,
          countedQuantity: counted,
          discrepancy,
          justification: item.justification || null
        };
      });
      await InventoryAuditDetail.bulkCreate(records, { transaction });
    }

    await transaction.commit();
    res.json({ success: true, message: 'Borrador guardado correctamente.' });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'Error interno al guardar borrador.' });
  }
}

// Finalize Audit and Commit inventory stock updates & Kardex logs
async function handleFinalizeAudit(req, res) {
  const transaction = await sequelize.transaction();
  try {
    const { auditId, items } = req.body;
    const audit = await InventoryAudit.findByPk(auditId, { transaction });
    if (!audit) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Auditoría no encontrada' });
    }

    if (audit.status === 'completed') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'La auditoría ya está finalizada.' });
    }

    // 1. Clear old draft details
    await InventoryAuditDetail.destroy({
      where: { inventoryAuditId: auditId },
      transaction
    });

    // 2. Build and Bulk Create Details
    const records = [];
    if (items && items.length > 0) {
      for (const item of items) {
        const expected = parseFloat(item.expectedQuantity) || 0;
        const counted = parseFloat(item.countedQuantity) || 0;
        const discrepancy = counted - expected;
        
        records.push({
          inventoryAuditId: auditId,
          productId: item.productId,
          expectedQuantity: expected,
          countedQuantity: counted,
          discrepancy,
          justification: item.justification || null
        });

        // 3. Update stock in BranchProduct
        const bp = await BranchProduct.findOne({
          where: { branchId: audit.branchId, productId: item.productId },
          transaction
        });

        if (bp) {
          bp.totalStock = counted;
          await bp.save({ transaction });
        } else {
          // If product wasn't mapped, create mapping
          await BranchProduct.create({
            branchId: audit.branchId,
            productId: item.productId,
            totalStock: counted,
            averageCost: item.averageCost || 0.00,
            salePrice: item.salePrice || 0.00,
            minStock: 0
          }, { transaction });
        }

        // 4. Log to Kardex if discrepancy exists
        if (Math.abs(discrepancy) > 0.001) {
          const isInput = discrepancy > 0;
          await logKardex({
            productId: item.productId,
            branchId: audit.branchId,
            userId: req.user.id,
            quantity: Math.abs(discrepancy),
            isInput,
            type: isInput ? 'input' : 'output',
            description: `Auditoría física (Sector: ${audit.sector}). Justificación: ${item.justification || 'Ajuste regular'}`,
            transaction
          });
        }
      }

      await InventoryAuditDetail.bulkCreate(records, { transaction });
    }

    // 5. Finalize status
    audit.status = 'completed';
    await audit.save({ transaction });

    // 6. Log event to AuditLog
    await AuditLog.create({
      userId: req.user.id,
      branchId: audit.branchId,
      action: 'inventory.audit_finalized',
      details: JSON.stringify({ auditId: audit.id, itemCount: records.length }),
      ipAddress: req.ip
    }, { transaction });

    await transaction.commit();
    res.json({ success: true, message: 'Auditoría finalizada y ajustada con éxito.' });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'Error interno al finalizar auditoría.' });
  }
}

// Render Audit Session Discrepancy & Merma Report
async function renderAuditReport(req, res, next) {
  try {
    const audit = await InventoryAudit.findByPk(req.params.id, {
      include: [
        { model: Branch, as: 'branch' },
        { model: User, as: 'user' },
        { 
          model: InventoryAuditDetail, 
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!audit) {
      return res.redirect('/inventory/audits?error=Auditoría no encontrada');
    }

    if (['supervisor', 'cashier'].includes(req.user.roleId) && audit.branchId !== req.user.branchId) {
      return res.redirect('/inventory/audits?error=No autorizado para esta sucursal');
    }

    // Calculate aggregated stats
    let totalItems = audit.details.length;
    let discrepancyItems = 0;
    let financialLoss = 0.00; // sum of cost of negative discrepancies (mermas)
    let financialGain = 0.00; // sum of cost of positive discrepancies

    // Fetch BranchProduct relations to read averageCosts for final valuation report
    const detailsValued = [];
    for (const d of audit.details) {
      const bp = await BranchProduct.findOne({
        where: { branchId: audit.branchId, productId: d.productId }
      });
      const cost = bp ? parseFloat(bp.averageCost) : 0.00;
      const discrepancy = parseFloat(d.discrepancy);
      const totalCostValue = discrepancy * cost;

      if (Math.abs(discrepancy) > 0.001) {
        discrepancyItems++;
        if (discrepancy < 0) {
          financialLoss += Math.abs(totalCostValue);
        } else {
          financialGain += totalCostValue;
        }
      }

      detailsValued.push({
        ...d.toJSON(),
        averageCost: cost,
        totalCostValue
      });
    }

    res.render('pages/inventory/audits-report', {
      title: `Reporte de Auditoría - Sector: ${audit.sector}`,
      user: req.user,
      audit,
      details: detailsValued,
      totalItems,
      discrepancyItems,
      financialLoss,
      financialGain
    });
  } catch (err) {
    next(err);
  }
}

const renderInitialLoad = async (req, res, next) => {
  try {
    const { Category, Product, BranchProduct } = require('../../core/models');
    
    const categories = await Category.findAll({ order: [['name', 'ASC']] });
    const products = await Product.findAll({
      order: [['name', 'ASC']],
      include: [{
        model: BranchProduct,
        as: 'branchProducts',
        where: { branchId: req.user.branchId },
        required: false
      }]
    });

    return res.render('pages/inventory/initial-load', {
      title: 'Levantamiento Inicial de Inventario',
      user: req.user,
      categories,
      products
    });
  } catch (error) {
    return next(error);
  }
};

const quickCreateProduct = async (req, res, next) => {
  const { name, barCode, categoryId, type } = req.body;
  let imagePath = null;
  const fs = require('fs');

  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  const { Branch, BranchProduct } = require('../../core/models');
  const transaction = await sequelize.transaction();

  try {
    if (!name || name.trim() === '') {
      throw new Error('El nombre del producto es obligatorio.');
    }

    if (barCode && barCode.trim() !== '') {
      const existing = await Product.findOne({ where: { barCode: barCode.trim() }, transaction });
      if (existing) {
        throw new Error('El código de barras ya está registrado.');
      }
    }

    const product = await Product.create({
      name: name.trim(),
      barCode: barCode && barCode.trim() !== '' ? barCode.trim() : null,
      type: type || 'physical',
      categoryId: categoryId ? parseInt(categoryId, 10) : null,
      imagePath
    }, { transaction });

    const allBranches = await Branch.findAll({ transaction });
    for (const b of allBranches) {
      await BranchProduct.create({
        productId: product.id,
        branchId: b.id,
        totalStock: 0,
        averageCost: 0.00,
        salePrice: 0.00,
        minStock: 0
      }, { transaction });
    }

    await transaction.commit();

    return res.json({ success: true, product });
  } catch (error) {
    await transaction.rollback();
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    return res.status(400).json({ success: false, message: error.message });
  }
};

const submitInitialLoad = async (req, res, next) => {
  const { items } = req.body;
  const branchId = req.user.branchId;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe ingresar al menos un artículo.' });
  }

  const { ProductBatch, BranchProduct } = require('../../core/models');
  const transaction = await sequelize.transaction();

  try {
    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const qty = parseInt(item.quantity, 10);
      const cost = parseFloat(item.unitCost) || 0.00;
      const price = parseFloat(item.salePrice) || 0.00;
      const batchCode = item.batchCode ? item.batchCode.trim() : 'LOTE-INICIAL';
      const expDate = item.expirationDate || null;

      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Cantidad inválida para el producto ID ${productId}`);
      }

      await ProductBatch.create({
        productId,
        branchId,
        batchCode,
        expirationDate: expDate,
        initialQuantity: qty,
        currentQuantity: qty,
        unitCost: cost
      }, { transaction });

      let bp = await BranchProduct.findOne({
        where: { productId, branchId },
        transaction
      });

      if (!bp) {
        bp = await BranchProduct.create({
          productId,
          branchId,
          totalStock: 0,
          averageCost: 0.00,
          salePrice: price,
          minStock: 0
        }, { transaction });
      }

      const prevStock = bp.totalStock;
      const prevCost = parseFloat(bp.averageCost || 0);
      const newStock = prevStock + qty;

      let newAvgCost = cost;
      if (newStock > 0) {
        newAvgCost = ((prevStock * prevCost) + (qty * cost)) / newStock;
      }

      await bp.update({
        totalStock: newStock,
        averageCost: newAvgCost,
        salePrice: price > 0 ? price : bp.salePrice
      }, { transaction });

      await logKardex({
        productId,
        branchId,
        userId: req.user.id,
        quantity: qty,
        isInput: true,
        type: 'adjustment_in',
        description: 'Levantamiento inicial de inventario',
        transaction
      });
    }

    await transaction.commit();

    await AuditLog.create({
      userId: req.user.id,
      branchId,
      action: 'inventory.initial_load_completed',
      details: { itemsCount: items.length },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Inventario inicial cargado correctamente.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  renderAuditsIndex,
  handleCreateAudit,
  renderAuditCount,
  searchBranchProducts,
  loadAllBranchProducts,
  handleSaveDraft,
  handleFinalizeAudit,
  renderAuditReport,
  renderInitialLoad,
  quickCreateProduct,
  submitInitialLoad
};
