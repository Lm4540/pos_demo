const { Sale, SaleDetail, Product, BranchProduct, ProductBatch, Client, CashierTurn, Promotion, Category } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');
const { Op } = require('sequelize');

const renderPOS = async (req, res, next) => {
  try {
    const activeTurn = req.activeTurn; // Guaranteed by checkActiveTurn middleware

    // Get frequent products in this branch, including their category
    const branchProducts = await BranchProduct.findAll({
      where: { branchId: req.user.branchId },
      include: [{
        model: Product,
        as: 'product',
        where: { isFrequent: true },
        include: [{ model: Category, as: 'category' }]
      }]
    });

    const clients = await Client.findAll({
      where: { branchId: req.user.branchId },
      order: [['name', 'ASC']]
    });

    const clientsWithAlerts = await Promise.all(clients.map(async (client) => {
      const plainClient = client.get({ plain: true });
      plainClient.isOverdue = false;
      plainClient.overdueDays = 0;

      if (parseFloat(client.currentBalance) > 0) {
        const creditSales = await Sale.findAll({
          where: { clientId: client.id, paymentMethod: 'credit' }
        });

        const sortedSales = [...creditSales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        let remainingBalance = parseFloat(client.currentBalance);
        let oldestUnpaid = null;
        let runningSum = 0;
        
        for (const sale of sortedSales) {
          runningSum += parseFloat(sale.totalAmount);
          oldestUnpaid = sale;
          if (runningSum >= remainingBalance) {
            break;
          }
        }

        if (oldestUnpaid) {
          const ageInDays = Math.floor((new Date() - new Date(oldestUnpaid.createdAt)) / (1000 * 60 * 60 * 24));
          plainClient.overdueDays = ageInDays;
          if (ageInDays > client.creditDays) {
            plainClient.isOverdue = true;
          }
        }
      }
      return plainClient;
    }));

    const today = new Date().toISOString().slice(0, 10);
    const activePromotions = await Promotion.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          {
            [Op.or]: [
              { startDate: { [Op.is]: null } },
              { startDate: { [Op.lte]: today } }
            ]
          },
          {
            [Op.or]: [
              { endDate: { [Op.is]: null } },
              { endDate: { [Op.gte]: today } }
            ]
          }
        ]
      }
    });

    const categories = await Category.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/sales/pos', {
      title: 'Punto de Venta',
      frequentProducts: branchProducts,
      clients: clientsWithAlerts,
      turn: activeTurn,
      promotions: activePromotions,
      categories,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const searchProducts = async (req, res, next) => {
  const { q } = req.query;
  try {
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchQuery = q.trim().toLowerCase();

    // Find products in branch matching query
    const results = await BranchProduct.findAll({
      where: {
        branchId: req.user.branchId,
        totalStock: { [Op.gt]: 0 } // Only sellable products
      },
      include: [{
        model: Product,
        as: 'product',
        where: {
          [Op.or]: [
            sequelize.where(sequelize.fn('LOWER', sequelize.col('product.name')), 'LIKE', `%${searchQuery}%`),
            sequelize.where(sequelize.fn('LOWER', sequelize.col('product.barCode')), 'LIKE', `%${searchQuery}%`)
          ]
        }
      }],
      limit: 10
    });

    const mapped = results.map(bp => ({
      id: bp.productId,
      name: bp.product.name,
      barCode: bp.product.barCode,
      imagePath: bp.product.imagePath,
      totalStock: bp.totalStock,
      salePrice: bp.salePrice,
      averageCost: bp.averageCost,
      categoryId: bp.product.categoryId
    }));

    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createSale = async (req, res, next) => {
  const { clientId, paymentMethod, items, splitCash, splitCard, splitCredit } = req.body;
  const activeTurn = req.activeTurn;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'La venta debe contener al menos un producto.' });
  }

  if (!paymentMethod || !['cash', 'credit', 'card', 'split'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'Método de pago no válido.' });
  }

  const transaction = await sequelize.transaction();

  try {
    let totalAmount = 0;
    let totalDiscount = 0;
    const saleDetailsToCreate = [];
    const stockUpdates = []; // To update branch total stocks later

    // Generate unique ticket number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TKT-${dateStr}-${rand}`;

    // Get active promotions
    const today = new Date().toISOString().slice(0, 10);
    const promotions = await Promotion.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          {
            [Op.or]: [
              { startDate: { [Op.is]: null } },
              { startDate: { [Op.lte]: today } }
            ]
          },
          {
            [Op.or]: [
              { endDate: { [Op.is]: null } },
              { endDate: { [Op.gte]: today } }
            ]
          }
        ]
      },
      transaction
    });

    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const quantity = parseInt(item.quantity, 10);

      if (isNaN(productId) || isNaN(quantity) || quantity <= 0) {
        throw new Error('Artículos o cantidades inválidas.');
      }

      // Check BranchProduct
      const branchProduct = await BranchProduct.findOne({
        where: { branchId: req.user.branchId, productId },
        transaction
      });

      if (!branchProduct || branchProduct.totalStock < quantity) {
        const prod = await Product.findByPk(productId, { transaction });
        throw new Error(`Stock insuficiente para el producto: ${prod ? prod.name : 'ID ' + productId}`);
      }

      // Cargar producto para validar su categoría
      const product = await Product.findByPk(productId, { transaction });
      if (!product) {
        throw new Error(`Producto ID ${productId} no encontrado.`);
      }

      // Get batches in FIFO order of expiration
      const batches = await ProductBatch.findAll({
        where: {
          branchId: req.user.branchId,
          productId,
          currentQuantity: { [Op.gt]: 0 }
        },
        order: [
          ['expirationDate', 'ASC'],
          ['id', 'ASC']
        ],
        transaction
      });

      let remainingToExhaust = quantity;
      const itemPrice = parseFloat(branchProduct.salePrice);
      
      // Evaluar promoción aplicable
      let promo = promotions.find(p => p.productId === product.id);
      if (!promo && product.categoryId) {
        promo = promotions.find(p => p.categoryId === product.categoryId);
      }

      let lineDiscount = 0.00;
      if (promo) {
        if (promo.type === 'percentage') {
          const discountPerUnit = itemPrice * (parseFloat(promo.value) / 100);
          lineDiscount = discountPerUnit * quantity;
        } else if (promo.type === 'fixed_price') {
          const promoPrice = parseFloat(promo.value);
          if (promoPrice < itemPrice) {
            const discountPerUnit = itemPrice - promoPrice;
            lineDiscount = discountPerUnit * quantity;
          }
        } else if (promo.type === 'bulk') {
          const buyQty = promo.buyQty;
          const payQty = promo.payQty;
          if (quantity >= buyQty) {
            const groups = Math.floor(quantity / buyQty);
            const freeUnits = groups * (buyQty - payQty);
            lineDiscount = freeUnits * itemPrice;
          }
        }
      }

      // Acumular total neto (bruto - descuento)
      totalAmount += (itemPrice * quantity) - lineDiscount;
      totalDiscount += lineDiscount;

      for (const batch of batches) {
        const toTake = Math.min(remainingToExhaust, batch.currentQuantity);
        
        batch.currentQuantity -= toTake;
        await batch.save({ transaction });

        // Prorratear el descuento en este lote
        const batchDiscount = lineDiscount * (toTake / quantity);

        saleDetailsToCreate.push({
          productId,
          batchId: batch.id,
          quantity: toTake,
          unitPrice: itemPrice,
          discountAmount: batchDiscount,
          unitCostAtSale: parseFloat(batch.unitCost)
        });

        remainingToExhaust -= toTake;
        if (remainingToExhaust === 0) break;
      }

      if (remainingToExhaust > 0) {
        const prod = await Product.findByPk(productId, { transaction });
        throw new Error(`Inconsistencia de stock en lotes para el producto: ${prod ? prod.name : 'ID ' + productId}`);
      }

      // Log Kardex
      const { logKardex } = require('../inventory/kardexService');
      await logKardex({
        productId,
        branchId: req.user.branchId,
        userId: req.user.id,
        quantity,
        isInput: false,
        type: 'sale',
        description: `Venta - Ticket #${ticketNumber}`,
        transaction
      });

      // Prepare branch product stock reduction
      branchProduct.totalStock -= quantity;
      stockUpdates.push(branchProduct);
    }

    // Determine specific payment amounts
    let amountCash = 0.00;
    let amountCard = 0.00;
    let amountCredit = 0.00;

    if (paymentMethod === 'cash') {
      amountCash = totalAmount;
    } else if (paymentMethod === 'card') {
      amountCard = totalAmount;
    } else if (paymentMethod === 'credit') {
      amountCredit = totalAmount;
    } else if (paymentMethod === 'split') {
      amountCash = parseFloat(splitCash) || 0.00;
      amountCard = parseFloat(splitCard) || 0.00;
      amountCredit = parseFloat(splitCredit) || 0.00;

      // Check sum equals totalAmount
      const sum = amountCash + amountCard + amountCredit;
      if (Math.abs(sum - totalAmount) > 0.01) {
        throw new Error(`La suma de los montos ($${sum.toFixed(2)}) no coincide con el total de la venta ($${totalAmount.toFixed(2)}).`);
      }
    }

    // Check client credit limit if credit portion > 0
    let client = null;
    if (amountCredit > 0) {
      if (!clientId) {
        throw new Error('Debe especificar un cliente para ventas con saldo al crédito.');
      }
      client = await Client.findByPk(clientId, { transaction });
      if (!client || client.branchId !== req.user.branchId) {
        throw new Error('Cliente no válido.');
      }
      const newBalance = parseFloat(client.currentBalance) + amountCredit;
      if (newBalance > parseFloat(client.creditLimit)) {
        throw new Error(`Crédito insuficiente. Límite: $${parseFloat(client.creditLimit).toFixed(2)}, Saldo actual: $${parseFloat(client.currentBalance).toFixed(2)}, Monto solicitado al crédito: $${amountCredit.toFixed(2)}`);
      }
      client.currentBalance = newBalance;
      await client.save({ transaction });
    }

    // Save all stock updates
    for (const bp of stockUpdates) {
      await bp.save({ transaction });
    }

    // Create Sale record
    const sale = await Sale.create({
      ticketNumber,
      branchId: req.user.branchId,
      userId: req.user.id,
      turnId: activeTurn.id,
      clientId: amountCredit > 0 ? clientId : null,
      paymentMethod,
      totalAmount,
      discountAmount: totalDiscount,
      amountCash,
      amountCard,
      amountCredit
    }, { transaction });

    // Save details
    for (const detail of saleDetailsToCreate) {
      await SaleDetail.create({
        saleId: sale.id,
        ...detail
      }, { transaction });
    }

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'pos.sale_created',
      details: { ticketNumber, totalAmount, paymentMethod, clientId: sale.clientId, amountCash, amountCard, amountCredit },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Venta procesada correctamente.',
      ticketNumber,
      saleId: sale.id
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const renderHistory = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };

    const salesWithDetails = await Sale.findAll({
      where: whereClause,
      include: [
        { model: Client, as: 'client' },
        {
          model: SaleDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    return res.render('pages/sales/history', {
      title: 'Historial de Tickets',
      sales: salesWithDetails
    });
  } catch (error) {
    return next(error);
  }
};

const voidSale = async (req, res, next) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const sale = await Sale.findByPk(id, {
      include: [{ model: SaleDetail, as: 'details' }],
      transaction
    });

    if (!sale) {
      throw new Error('Venta no encontrada.');
    }

    if (req.user.roleId !== 'admin' && sale.branchId !== req.user.branchId) {
      throw new Error('No tienes permiso para anular tickets de otras sucursales.');
    }

    // 1. Revert inventory quantities
    for (const detail of sale.details) {
      // Revert ProductBatch
      const batch = await ProductBatch.findByPk(detail.batchId, { transaction });
      if (batch) {
        batch.currentQuantity += detail.quantity;
        await batch.save({ transaction });
      }

      // Revert BranchProduct
      const branchProduct = await BranchProduct.findOne({
        where: { branchId: sale.branchId, productId: detail.productId },
        transaction
      });
      if (branchProduct) {
        // Log Kardex
        const { logKardex } = require('../inventory/kardexService');
        await logKardex({
          productId: detail.productId,
          branchId: sale.branchId,
          userId: req.user.id,
          quantity: detail.quantity,
          isInput: true,
          type: 'void_sale',
          description: `Anulación Venta - Ticket #${sale.ticketNumber}`,
          transaction
        });

        branchProduct.totalStock += detail.quantity;
        await branchProduct.save({ transaction });
      }
    }

    // 2. Revert Client credit balance if applicable
    if (sale.clientId && (parseFloat(sale.amountCredit) > 0 || sale.paymentMethod === 'credit')) {
      const client = await Client.findByPk(sale.clientId, { transaction });
      if (client) {
        const revertAmount = parseFloat(sale.amountCredit) > 0 ? parseFloat(sale.amountCredit) : parseFloat(sale.totalAmount);
        client.currentBalance = Math.max(0, parseFloat(client.currentBalance) - revertAmount);
        await client.save({ transaction });
      }
    }

    // 3. Delete sale record (which cascades to details)
    await sale.destroy({ transaction });

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'pos.sale_voided',
      details: { ticketNumber: sale.ticketNumber, totalAmount: sale.totalAmount, paymentMethod: sale.paymentMethod },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Ticket anulado y existencias devueltas correctamente.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  renderPOS,
  searchProducts,
  createSale,
  renderHistory,
  voidSale
};
