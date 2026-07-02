const { BranchTransfer, BranchTransferDetail, Branch, Product, BranchProduct, ProductBatch, User, sequelize } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { logKardex } = require('./kardexService');
const { Op } = require('sequelize');

const listTransfers = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : {
      [Op.or]: [
        { fromBranchId: req.user.branchId },
        { toBranchId: req.user.branchId }
      ]
    };

    const transfers = await BranchTransfer.findAll({
      where: whereClause,
      include: [
        { model: Branch, as: 'fromBranch' },
        { model: Branch, as: 'toBranch' },
        { model: User, as: 'user' }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.render('pages/transfers/index', {
      title: 'Traslados de Inventario',
      transfers
    });
  } catch (error) {
    return next(error);
  }
};

const renderNewTransfer = async (req, res, next) => {
  try {
    const branches = await Branch.findAll({
      where: { id: { [Op.ne]: req.user.branchId } },
      order: [['name', 'ASC']]
    });

    // Get active products with stock in current branch
    const branchProducts = await BranchProduct.findAll({
      where: {
        branchId: req.user.branchId,
        totalStock: { [Op.gt]: 0 }
      },
      include: [{ model: Product, as: 'product' }],
      order: [[{ model: Product, as: 'product' }, 'name', 'ASC']]
    });

    return res.render('pages/transfers/new', {
      title: 'Nuevo Traslado de Stock',
      branches,
      branchProducts,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createTransfer = async (req, res, next) => {
  const { toBranchId, items } = req.body;
  const fromBranchId = req.user.branchId;

  if (!toBranchId || toBranchId == fromBranchId) {
    return res.status(400).json({ success: false, message: 'Debe seleccionar una sucursal de destino diferente.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe agregar al menos un artículo para trasladar.' });
  }

  const transaction = await sequelize.transaction();

  try {
    // Generate unique transfer number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const transferNumber = `TRF-${dateStr}-${rand}`;

    const transfer = await BranchTransfer.create({
      transferNumber,
      fromBranchId,
      toBranchId: parseInt(toBranchId, 10),
      userId: req.user.id,
      status: 'transit'
    }, { transaction });

    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const batchId = parseInt(item.batchId, 10);
      const quantity = parseInt(item.quantity, 10);

      if (isNaN(productId) || isNaN(batchId) || isNaN(quantity) || quantity <= 0) {
        throw new Error('Artículos, lotes o cantidades no válidas.');
      }

      // 1. Get origin batch
      const originBatch = await ProductBatch.findOne({
        where: {
          id: batchId,
          productId,
          branchId: fromBranchId
        },
        transaction
      });

      if (!originBatch || originBatch.currentQuantity < quantity) {
        throw new Error('Stock insuficiente en el lote de origen.');
      }

      // 2. Get origin BranchProduct
      const originBranchProduct = await BranchProduct.findOne({
        where: {
          productId,
          branchId: fromBranchId
        },
        transaction
      });

      if (!originBranchProduct || originBranchProduct.totalStock < quantity) {
        throw new Error('Stock total insuficiente en la sucursal de origen.');
      }

      // --- LOG KARDEX ORIGIN (EXIT) ---
      await logKardex({
        productId,
        branchId: fromBranchId,
        userId: req.user.id,
        quantity,
        isInput: false,
        type: 'transfer_out',
        description: `Traslado Salida En Tránsito #${transferNumber} a sucursal ID ${toBranchId}`,
        transaction
      });

      // Deduct from origin batch & branchProduct
      originBatch.currentQuantity -= quantity;
      await originBatch.save({ transaction });

      originBranchProduct.totalStock -= quantity;
      await originBranchProduct.save({ transaction });

      // 3. Create transfer detail
      await BranchTransferDetail.create({
        transferId: transfer.id,
        productId,
        batchCode: originBatch.batchCode,
        quantity,
        unitCost: originBatch.unitCost
      }, { transaction });
    }

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: fromBranchId,
      action: 'inventory.transfer_created',
      details: { transferNumber, fromBranchId, toBranchId, transferId: transfer.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Traslado registrado y en tránsito con éxito.', transferId: transfer.id });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const renderReceiveTransfer = async (req, res, next) => {
  const { id } = req.params;
  try {
    const transfer = await BranchTransfer.findByPk(id, {
      include: [
        { model: Branch, as: 'fromBranch' },
        { model: Branch, as: 'toBranch' },
        { model: User, as: 'user' },
        {
          model: BranchTransferDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!transfer) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Traslado no encontrado.',
        user: req.user
      });
    }

    if (transfer.status !== 'transit') {
      return res.redirect('/transfers');
    }

    // Verify branch restrictions: must be target branch to receive
    if (req.user.roleId !== 'admin' && transfer.toBranchId !== req.user.branchId) {
      return res.status(403).render('pages/error', {
        title: 'Acceso Denegado',
        message: 'No tienes permiso para recibir traslados destinados a otra sucursal.',
        user: req.user
      });
    }

    return res.render('pages/transfers/receive', {
      title: `Recibir Traslado - ${transfer.transferNumber}`,
      transfer
    });
  } catch (error) {
    return next(error);
  }
};

const receiveTransfer = async (req, res, next) => {
  const { id } = req.params;
  const { items } = req.body; // Array of { detailId, receivedQuantity }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe especificar los artículos recibidos.' });
  }

  const transaction = await sequelize.transaction();

  try {
    const transfer = await BranchTransfer.findByPk(id, {
      include: [{ model: BranchTransferDetail, as: 'details' }],
      transaction
    });

    if (!transfer) {
      throw new Error('Traslado no encontrado.');
    }

    if (transfer.status !== 'transit') {
      throw new Error('El traslado no se encuentra en estado En Tránsito.');
    }

    if (req.user.roleId !== 'admin' && transfer.toBranchId !== req.user.branchId) {
      throw new Error('No tienes permisos para recibir traslados en esta sucursal.');
    }

    for (const item of items) {
      const detailId = parseInt(item.detailId, 10);
      const receivedQty = parseInt(item.receivedQuantity, 10);

      if (isNaN(detailId) || isNaN(receivedQty) || receivedQty < 0) {
        throw new Error('Cantidades recibidas no válidas.');
      }

      const detail = transfer.details.find(d => d.id === detailId);
      if (!detail) {
        throw new Error('Artículo de traslado no coincide.');
      }

      if (receivedQty > detail.quantity) {
        throw new Error('La cantidad recibida no puede superar la cantidad enviada.');
      }

      // Update detail received quantity
      detail.receivedQuantity = receivedQty;
      await detail.save({ transaction });

      if (receivedQty > 0) {
        // Find corresponding ProductBatch from origin branch to get expirationDate
        const originBatch = await ProductBatch.findOne({
          where: {
            branchId: transfer.fromBranchId,
            productId: detail.productId,
            batchCode: detail.batchCode
          },
          transaction
        });

        const expDate = originBatch ? originBatch.expirationDate : null;

        // 1. Find or Create BranchProduct in destination branch
        let destBranchProduct = await BranchProduct.findOne({
          where: {
            productId: detail.productId,
            branchId: transfer.toBranchId
          },
          transaction
        });

        // Kardex entry logging
        await logKardex({
          productId: detail.productId,
          branchId: transfer.toBranchId,
          userId: req.user.id,
          quantity: receivedQty,
          isInput: true,
          type: 'transfer_in',
          description: `Ingreso Traslado #${transfer.transferNumber} (Verificado)`,
          transaction
        });

        if (destBranchProduct) {
          destBranchProduct.totalStock += receivedQty;
          // Simple weighted average cost adjustment
          const oldStock = destBranchProduct.totalStock - receivedQty;
          const oldAvgCost = parseFloat(destBranchProduct.averageCost);
          const addedCost = receivedQty * parseFloat(detail.unitCost);
          if (destBranchProduct.totalStock > 0) {
            destBranchProduct.averageCost = ((oldStock * oldAvgCost) + addedCost) / destBranchProduct.totalStock;
          }
          await destBranchProduct.save({ transaction });
        } else {
          // Find sale price from origin sucursal product settings to copy over
          const originBP = await BranchProduct.findOne({
            where: { branchId: transfer.fromBranchId, productId: detail.productId },
            transaction
          });
          const salePrice = originBP ? originBP.salePrice : detail.unitCost;

          await BranchProduct.create({
            branchId: transfer.toBranchId,
            productId: detail.productId,
            totalStock: receivedQty,
            averageCost: detail.unitCost,
            salePrice
          }, { transaction });
        }

        // 2. Find or Create ProductBatch in destination
        let destBatch = await ProductBatch.findOne({
          where: {
            branchId: transfer.toBranchId,
            productId: detail.productId,
            batchCode: detail.batchCode
          },
          transaction
        });

        if (destBatch) {
          destBatch.currentQuantity += receivedQty;
          await destBatch.save({ transaction });
        } else {
          await ProductBatch.create({
            branchId: transfer.toBranchId,
            productId: detail.productId,
            batchCode: detail.batchCode,
            expirationDate: expDate,
            initialQuantity: receivedQty,
            currentQuantity: receivedQty,
            unitCost: detail.unitCost
          }, { transaction });
        }
      }
    }

    // Set transfer details
    transfer.status = 'completed';
    transfer.receivedByUserId = req.user.id;
    transfer.receivedAt = new Date();
    await transfer.save({ transaction });

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.transfer_received',
      details: { transferNumber: transfer.transferNumber, transferId: transfer.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Traslado recibido e ingresado al inventario con éxito.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const cancelTransfer = async (req, res, next) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const transfer = await BranchTransfer.findByPk(id, {
      include: [{ model: BranchTransferDetail, as: 'details' }],
      transaction
    });

    if (!transfer) {
      throw new Error('Traslado no encontrado.');
    }

    if (transfer.status !== 'transit') {
      throw new Error('Solo se pueden cancelar traslados en tránsito.');
    }

    // Verify branch restrictions: must be origin branch to cancel
    if (req.user.roleId !== 'admin' && transfer.fromBranchId !== req.user.branchId) {
      throw new Error('No tienes permisos para cancelar este traslado.');
    }

    for (const detail of transfer.details) {
      // 1. Restore ProductBatch at origin
      const originBatch = await ProductBatch.findOne({
        where: {
          branchId: transfer.fromBranchId,
          productId: detail.productId,
          batchCode: detail.batchCode
        },
        transaction
      });

      if (originBatch) {
        originBatch.currentQuantity += detail.quantity;
        await originBatch.save({ transaction });
      } else {
        // Recreate origin batch if it was somehow removed/exhausted
        await ProductBatch.create({
          branchId: transfer.fromBranchId,
          productId: detail.productId,
          batchCode: detail.batchCode,
          expirationDate: null, // expiration can be empty or updated
          initialQuantity: detail.quantity,
          currentQuantity: detail.quantity,
          unitCost: detail.unitCost
        }, { transaction });
      }

      // 2. Restore BranchProduct total stock at origin
      const originBP = await BranchProduct.findOne({
        where: {
          branchId: transfer.fromBranchId,
          productId: detail.productId
        },
        transaction
      });

      if (originBP) {
        originBP.totalStock += detail.quantity;
        await originBP.save({ transaction });
      }

      // 3. Log Kardex at origin (Input / Return)
      await logKardex({
        productId: detail.productId,
        branchId: transfer.fromBranchId,
        userId: req.user.id,
        quantity: detail.quantity,
        isInput: true,
        type: 'transfer_cancel',
        description: `Devolución Traslado Cancelado #${transfer.transferNumber}`,
        transaction
      });
    }

    transfer.status = 'cancelled';
    await transfer.save({ transaction });

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'inventory.transfer_cancelled',
      details: { transferNumber: transfer.transferNumber, transferId: transfer.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Traslado cancelado y mercadería devuelta correctamente.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const viewTransfer = async (req, res, next) => {
  const { id } = req.params;
  try {
    const transfer = await BranchTransfer.findByPk(id, {
      include: [
        { model: Branch, as: 'fromBranch' },
        { model: Branch, as: 'toBranch' },
        { model: User, as: 'user' },
        { model: User, as: 'receivedByUser' },
        {
          model: BranchTransferDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!transfer) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Traslado no encontrado.',
        user: req.user
      });
    }

    // Verify branch restrictions
    if (req.user.roleId !== 'admin' && transfer.fromBranchId !== req.user.branchId && transfer.toBranchId !== req.user.branchId) {
      return res.status(403).render('pages/error', {
        title: 'Acceso Denegado',
        message: 'No tienes permiso para ver traslados de otras sucursales.',
        user: req.user
      });
    }

    return res.render('pages/transfers/view', {
      title: `Traslado - ${transfer.transferNumber}`,
      transfer
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listTransfers,
  renderNewTransfer,
  createTransfer,
  viewTransfer,
  renderReceiveTransfer,
  receiveTransfer,
  cancelTransfer
};
