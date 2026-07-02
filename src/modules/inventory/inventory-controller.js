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

module.exports = {
  renderAuditsIndex,
  handleCreateAudit,
  renderAuditCount,
  searchBranchProducts,
  loadAllBranchProducts,
  handleSaveDraft,
  handleFinalizeAudit,
  renderAuditReport
};
