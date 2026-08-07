const { 
  InventoryAudit, 
  InventoryAuditDetail, 
  Branch, 
  User, 
  Product, 
  BranchProduct, 
  ProductBatch, 
  AuditLog, 
  Kardex,
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

// Helper for chunked findAll queries on large datasets (e.g., 3,000+ items)
async function bulkFindAll(model, options, idField, ids, chunkSize = 1000) {
  if (!ids || ids.length === 0) return [];
  const results = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunkIds = ids.slice(i, i + chunkSize);
    const chunkOptions = {
      ...options,
      where: {
        ...(options.where || {}),
        [idField]: { [Op.in]: chunkIds }
      }
    };
    const chunkRes = await model.findAll(chunkOptions);
    results.push(...chunkRes);
  }
  return results;
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

    // 2. Build and Bulk Create Details, Stock updates, ProductBatches, and Kardex
    const records = [];
    if (items && items.length > 0) {
      const productIds = Array.from(new Set(items.map(item => parseInt(item.productId, 10)).filter(id => !isNaN(id))));

      // Bulk chunked fetch BranchProduct
      const existingBps = await bulkFindAll(BranchProduct, { transaction }, 'productId', productIds, 1000);
      const bpMap = new Map();
      existingBps.forEach(bp => {
        if (bp.branchId === audit.branchId) bpMap.set(bp.productId, bp);
      });

      // Bulk chunked fetch Products
      const products = await bulkFindAll(Product, { transaction }, 'id', productIds, 1000);
      const productMap = new Map();
      products.forEach(p => productMap.set(p.id, p));

      // Bulk chunked fetch existing ProductBatch records
      const existingBatches = await bulkFindAll(ProductBatch, { transaction }, 'productId', productIds, 1000);
      const productBatchesMap = new Map();
      existingBatches.forEach(b => {
        if (b.branchId === audit.branchId) {
          if (!productBatchesMap.has(b.productId)) productBatchesMap.set(b.productId, []);
          productBatchesMap.get(b.productId).push(b);
        }
      });

      // Bulk chunked fetch previous global stocks for Kardex
      const globalStocks = await bulkFindAll(BranchProduct, {
        attributes: ['productId', [sequelize.fn('SUM', sequelize.col('totalStock')), 'sumStock']],
        group: ['productId'],
        raw: true,
        transaction
      }, 'productId', productIds, 1000);
      const globalStockMap = new Map();
      globalStocks.forEach(gs => globalStockMap.set(gs.productId, parseFloat(gs.sumStock) || 0));

      const bpUpsertList = [];
      const batchesToCreate = [];
      const batchesToUpdate = [];
      const kardexLogsToCreate = [];

      for (const item of items) {
        const pId = parseInt(item.productId, 10);
        if (isNaN(pId)) continue;

        const expected = parseFloat(item.expectedQuantity) || 0;
        const counted = parseFloat(item.countedQuantity) || 0;
        const discrepancy = counted - expected;

        records.push({
          inventoryAuditId: auditId,
          productId: pId,
          expectedQuantity: expected,
          countedQuantity: counted,
          discrepancy,
          justification: item.justification || null
        });

        const bp = bpMap.get(pId);
        const prevBranchStock = bp ? bp.totalStock : 0;
        const prevGlobalStock = globalStockMap.get(pId) || 0;

        bpUpsertList.push({
          branchId: audit.branchId,
          productId: pId,
          totalStock: counted,
          averageCost: bp ? bp.averageCost : (item.averageCost || 0.00),
          salePrice: bp ? bp.salePrice : (item.salePrice || 0.00),
          minStock: bp ? bp.minStock : 0
        });

        const product = productMap.get(pId);
        if (product && product.type === 'physical') {
          const pBatches = productBatchesMap.get(pId) || [];
          if (counted === 0) {
            // Zero out all existing batches if counted stock is 0
            for (const b of pBatches) {
              if (b.currentQuantity > 0) {
                b.currentQuantity = 0;
                batchesToUpdate.push(b);
              }
            }
          } else {
            if (pBatches.length === 0) {
              // Create new batch if no batch exists
              const randomBatchCode = 'LOTE-AUD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
              const expDate = new Date();
              expDate.setDate(expDate.getDate() + 15);
              const expirationDate = expDate.toISOString().split('T')[0];

              batchesToCreate.push({
                branchId: audit.branchId,
                productId: pId,
                batchCode: randomBatchCode,
                expirationDate,
                initialQuantity: counted,
                currentQuantity: counted,
                unitCost: bp ? bp.averageCost : (item.averageCost || 0.00)
              });
            } else {
              // Update primary batch currentQuantity to match counted stock, zero out remaining
              pBatches[0].currentQuantity = counted;
              batchesToUpdate.push(pBatches[0]);
              for (let i = 1; i < pBatches.length; i++) {
                if (pBatches[i].currentQuantity > 0) {
                  pBatches[i].currentQuantity = 0;
                  batchesToUpdate.push(pBatches[i]);
                }
              }
            }
          }
        }

        if (Math.abs(discrepancy) > 0.001) {
          const isInput = discrepancy > 0;
          kardexLogsToCreate.push({
            productId: pId,
            branchId: audit.branchId,
            userId: req.user.id,
            quantity: Math.abs(discrepancy),
            isInput,
            previousGlobalStock: prevGlobalStock,
            previousBranchStock: prevBranchStock,
            type: 'adjustment',
            description: `Auditoría física (Sector: ${audit.sector}). Justificación: ${item.justification || 'Ajuste regular'}`
          });
        }
      }

      // Execute in chunks of 500 for high-performance bulk handling
      await InventoryAuditDetail.bulkCreate(records, { transaction, chunkSize: 500 });
      if (bpUpsertList.length > 0) {
        await BranchProduct.bulkCreate(bpUpsertList, {
          updateOnDuplicate: ['totalStock', 'averageCost', 'salePrice', 'updatedAt'],
          transaction,
          chunkSize: 500
        });
      }
      if (batchesToUpdate.length > 0) {
        for (let i = 0; i < batchesToUpdate.length; i += 500) {
          const chunk = batchesToUpdate.slice(i, i + 500);
          await Promise.all(chunk.map(b => b.save({ transaction })));
        }
      }
      if (batchesToCreate.length > 0) {
        await ProductBatch.bulkCreate(batchesToCreate, { transaction, chunkSize: 500 });
      }
      if (kardexLogsToCreate.length > 0) {
        await Kardex.bulkCreate(kardexLogsToCreate, { transaction, chunkSize: 500 });
      }
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
    let financialLoss = 0.00;
    let financialGain = 0.00;

    // Pre-fetch BranchProduct relations in bulk for valuation
    const productIds = Array.from(new Set(audit.details.map(d => d.productId)));
    const bps = productIds.length > 0 ? await bulkFindAll(BranchProduct, {}, 'productId', productIds, 1000) : [];
    const bpMap = new Map();
    bps.forEach(bp => {
      if (bp.branchId === audit.branchId) bpMap.set(bp.productId, bp);
    });

    const detailsValued = audit.details.map(d => {
      const bp = bpMap.get(d.productId);
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

      return {
        ...d.toJSON(),
        averageCost: cost,
        totalCostValue
      };
    });

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
  const { name, barCode, categoryId, type, reactivate, reactivateId } = req.body;
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

    const trimmedCode = barCode && barCode.trim() !== '' ? barCode.trim() : null;

    // Reactivate request
    if (reactivate === 'true' || reactivate === true) {
      let targetProduct = null;
      if (reactivateId) {
        targetProduct = await Product.findByPk(reactivateId, { paranoid: false, transaction });
      } else if (trimmedCode) {
        targetProduct = await Product.findOne({ where: { barCode: trimmedCode }, paranoid: false, transaction });
      }

      if (targetProduct && targetProduct.deletedAt !== null) {
        await targetProduct.restore({ transaction });
        const updatePayload = {
          name: name.trim(),
          barCode: trimmedCode,
          type: type || 'physical',
          categoryId: categoryId ? parseInt(categoryId, 10) : null
        };
        if (imagePath) updatePayload.imagePath = imagePath;
        await targetProduct.update(updatePayload, { transaction });

        const allBranches = await Branch.findAll({ transaction });
        for (const b of allBranches) {
          const bp = await BranchProduct.findOne({ where: { productId: targetProduct.id, branchId: b.id }, transaction });
          if (!bp) {
            await BranchProduct.create({
              productId: targetProduct.id,
              branchId: b.id,
              totalStock: 0,
              averageCost: 0.00,
              salePrice: 0.00,
              minStock: 0
            }, { transaction });
          }
        }

        await transaction.commit();
        return res.json({ success: true, message: `Producto "${targetProduct.name}" reactivado con éxito.`, product: targetProduct });
      }
    }

    if (trimmedCode) {
      const existing = await Product.findOne({ where: { barCode: trimmedCode }, paranoid: false, transaction });
      if (existing) {
        await transaction.rollback();
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }

        if (existing.deletedAt !== null) {
          return res.status(409).json({
            success: false,
            canReactivate: true,
            deletedProduct: {
              id: existing.id,
              name: existing.name,
              barCode: existing.barCode
            },
            message: `El código de barras "${trimmedCode}" pertenece al producto eliminado "${existing.name}". ¿Deseas reactivarlo?`
          });
        } else {
          return res.status(400).json({
            success: false,
            message: `El código de barras "${trimmedCode}" ya está registrado en el producto activo "${existing.name}".`
          });
        }
      }
    }

    const product = await Product.create({
      name: name.trim(),
      barCode: trimmedCode,
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

  const transaction = await sequelize.transaction();

  try {
    const productIds = Array.from(new Set(items.map(item => parseInt(item.productId, 10)).filter(id => !isNaN(id))));

    const existingBps = await bulkFindAll(BranchProduct, { transaction }, 'productId', productIds, 1000);
    const bpMap = new Map();
    existingBps.forEach(bp => {
      if (bp.branchId === branchId) bpMap.set(bp.productId, bp);
    });

    const globalStocks = await bulkFindAll(BranchProduct, {
      attributes: ['productId', [sequelize.fn('SUM', sequelize.col('totalStock')), 'sumStock']],
      group: ['productId'],
      raw: true,
      transaction
    }, 'productId', productIds, 1000);
    const globalStockMap = new Map();
    globalStocks.forEach(gs => globalStockMap.set(gs.productId, parseFloat(gs.sumStock) || 0));

    const batchesToCreate = [];
    const bpUpsertList = [];
    const kardexLogsToCreate = [];

    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const qty = parseInt(item.quantity, 10);
      const cost = parseFloat(item.unitCost) || 0.00;
      const price = parseFloat(item.salePrice) || 0.00;
      const batchCode = item.batchCode ? item.batchCode.trim() : 'LOTE-INICIAL';
      const expDate = item.expirationDate || null;

      if (isNaN(productId) || isNaN(qty) || qty <= 0) {
        throw new Error(`Cantidad inválida para el producto ID ${item.productId}`);
      }

      batchesToCreate.push({
        productId,
        branchId,
        batchCode,
        expirationDate: expDate,
        initialQuantity: qty,
        currentQuantity: qty,
        unitCost: cost
      });

      let bp = bpMap.get(productId);
      const prevStock = bp ? bp.totalStock : 0;
      const prevCost = bp ? parseFloat(bp.averageCost || 0) : 0.00;
      const prevSalePrice = bp ? parseFloat(bp.salePrice || 0) : 0.00;
      const prevGlobalStock = globalStockMap.get(productId) || 0;

      const newStock = prevStock + qty;
      let newAvgCost = cost;
      if (newStock > 0) {
        newAvgCost = ((prevStock * prevCost) + (qty * cost)) / newStock;
      }
      const finalPrice = price > 0 ? price : prevSalePrice;

      bpUpsertList.push({
        branchId,
        productId,
        totalStock: newStock,
        averageCost: newAvgCost,
        salePrice: finalPrice,
        minStock: bp ? bp.minStock : 0
      });

      if (bp) {
        bp.totalStock = newStock;
        bp.averageCost = newAvgCost;
        bp.salePrice = finalPrice;
      } else {
        bpMap.set(productId, { branchId, productId, totalStock: newStock, averageCost: newAvgCost, salePrice: finalPrice, minStock: 0 });
      }

      kardexLogsToCreate.push({
        productId,
        branchId,
        userId: req.user.id,
        quantity: qty,
        isInput: true,
        previousGlobalStock: prevGlobalStock,
        previousBranchStock: prevStock,
        type: 'adjustment',
        description: 'Levantamiento inicial de inventario'
      });
    }

    if (batchesToCreate.length > 0) {
      await ProductBatch.bulkCreate(batchesToCreate, { transaction, chunkSize: 500 });
    }
    if (bpUpsertList.length > 0) {
      await BranchProduct.bulkCreate(bpUpsertList, {
        updateOnDuplicate: ['totalStock', 'averageCost', 'salePrice', 'updatedAt'],
        transaction,
        chunkSize: 500
      });
    }
    if (kardexLogsToCreate.length > 0) {
      await Kardex.bulkCreate(kardexLogsToCreate, { transaction, chunkSize: 500 });
    }

    await transaction.commit();

    await AuditLog.create({
      userId: req.user.id,
      branchId,
      action: 'inventory.initial_load_completed',
      details: JSON.stringify({ itemsCount: items.length }),
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
