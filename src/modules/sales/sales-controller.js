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

    // Get service products (no stock needed)
    const serviceProducts = await Product.findAll({
      where: { type: 'service' },
      include: [{
        model: BranchProduct,
        as: 'branchProducts',
        where: { branchId: req.user.branchId },
        required: false
      }],
      order: [['name', 'ASC']]
    });

    const clients = await Client.findAll({
      where: { branchId: req.user.branchId },
      order: [['name', 'ASC']]
    });

    const activeClientIds = clients.filter(c => parseFloat(c.currentBalance) > 0).map(c => c.id);
    const salesByClient = {};
    if (activeClientIds.length > 0) {
      const creditSales = await Sale.findAll({
        where: { clientId: activeClientIds, paymentMethod: 'credit' },
        order: [['createdAt', 'DESC']]
      });
      for (const sale of creditSales) {
        if (!salesByClient[sale.clientId]) {
          salesByClient[sale.clientId] = [];
        }
        salesByClient[sale.clientId].push(sale);
      }
    }

    const clientsWithAlerts = clients.map((client) => {
      const plainClient = client.get({ plain: true });
      plainClient.isOverdue = false;
      plainClient.overdueDays = 0;

      if (parseFloat(client.currentBalance) > 0) {
        const clientSales = salesByClient[client.id] || [];
        let remainingBalance = parseFloat(client.currentBalance);
        let oldestUnpaid = null;
        let runningSum = 0;
        
        for (const sale of clientSales) {
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
    });

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
      serviceProducts,
      clients: clientsWithAlerts,
      turn: activeTurn,
      promotions: activePromotions,
      categories,
      customerDisplayMessage: process.env.CUSTOMER_DISPLAY_MESSAGE || '¡Bienvenido a nuestra tienda!',
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const renderPOSTouch = async (req, res, next) => {
  try {
    const activeTurn = req.activeTurn;

    const branchProducts = await BranchProduct.findAll({
      where: { branchId: req.user.branchId },
      include: [{
        model: Product,
        as: 'product',
        where: { isFrequent: true },
        include: [{ model: Category, as: 'category' }]
      }]
    });

    const serviceProducts = await Product.findAll({
      where: { type: 'service' },
      include: [{
        model: BranchProduct,
        as: 'branchProducts',
        where: { branchId: req.user.branchId },
        required: false
      }],
      order: [['name', 'ASC']]
    });

    const clients = await Client.findAll({
      where: { branchId: req.user.branchId },
      order: [['name', 'ASC']]
    });

    const activeClientIds = clients.filter(c => parseFloat(c.currentBalance) > 0).map(c => c.id);
    const salesByClient = {};
    if (activeClientIds.length > 0) {
      const creditSales = await Sale.findAll({
        where: { clientId: activeClientIds, paymentMethod: 'credit' },
        order: [['createdAt', 'DESC']]
      });
      for (const sale of creditSales) {
        if (!salesByClient[sale.clientId]) {
          salesByClient[sale.clientId] = [];
        }
        salesByClient[sale.clientId].push(sale);
      }
    }

    const clientsWithAlerts = clients.map((client) => {
      const plainClient = client.get({ plain: true });
      plainClient.isOverdue = false;
      plainClient.overdueDays = 0;
      if (parseFloat(client.currentBalance) > 0) {
        const clientSales = salesByClient[client.id] || [];
        let remainingBalance = parseFloat(client.currentBalance);
        let oldestUnpaid = null;
        let runningSum = 0;
        for (const sale of clientSales) {
          runningSum += parseFloat(sale.totalAmount);
          oldestUnpaid = sale;
          if (runningSum >= remainingBalance) break;
        }
        if (oldestUnpaid) {
          const ageInDays = Math.floor((new Date() - new Date(oldestUnpaid.createdAt)) / (1000 * 60 * 60 * 24));
          plainClient.overdueDays = ageInDays;
          if (ageInDays > client.creditDays) plainClient.isOverdue = true;
        }
      }
      return plainClient;
    });

    const today = new Date().toISOString().slice(0, 10);
    const activePromotions = await Promotion.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ startDate: { [Op.is]: null } }, { startDate: { [Op.lte]: today } }] },
          { [Op.or]: [{ endDate: { [Op.is]: null } }, { endDate: { [Op.gte]: today } }] }
        ]
      }
    });

    const categories = await Category.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/sales/pos-touch', {
      title: 'POS Touch',
      frequentProducts: branchProducts,
      serviceProducts,
      clients: clientsWithAlerts,
      turn: activeTurn,
      promotions: activePromotions,
      categories,
      customerDisplayMessage: process.env.CUSTOMER_DISPLAY_MESSAGE || '¡Bienvenido a nuestra tienda!',
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const renderCustomerDisplay = async (req, res, next) => {
  try {
    return res.render('pages/sales/customer-display', {
      title: 'Pantalla del Cliente',
      displayMessage: process.env.CUSTOMER_DISPLAY_MESSAGE || '¡Bienvenido a nuestra tienda!'
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

    // Find physical products in branch matching query (with stock)
    const physicalResults = await BranchProduct.findAll({
      where: {
        branchId: req.user.branchId,
        totalStock: { [Op.gt]: 0 } // Only sellable products
      },
      include: [{
        model: Product,
        as: 'product',
        where: {
          type: 'physical',
          [Op.or]: [
            sequelize.where(sequelize.fn('LOWER', sequelize.col('product.name')), 'LIKE', `%${searchQuery}%`),
            sequelize.where(sequelize.fn('LOWER', sequelize.col('product.barCode')), 'LIKE', `%${searchQuery}%`)
          ]
        }
      }],
      limit: 10
    });

    const mapped = physicalResults.map(bp => ({
      id: bp.productId,
      name: bp.product.name,
      barCode: bp.product.barCode,
      imagePath: bp.product.imagePath,
      totalStock: bp.totalStock,
      salePrice: bp.salePrice,
      averageCost: bp.averageCost,
      categoryId: bp.product.categoryId,
      type: 'physical'
    }));

    // Find service products matching query (no stock requirement)
    const serviceResults = await Product.findAll({
      where: {
        type: 'service',
        [Op.or]: [
          sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), 'LIKE', `%${searchQuery}%`),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('barCode')), 'LIKE', `%${searchQuery}%`)
        ]
      },
      include: [{
        model: BranchProduct,
        as: 'branchProducts',
        where: { branchId: req.user.branchId },
        required: false
      }],
      limit: 5
    });

    serviceResults.forEach(sp => {
      const bp = sp.branchProducts && sp.branchProducts[0];
      mapped.push({
        id: sp.id,
        name: sp.name,
        barCode: sp.barCode,
        imagePath: sp.imagePath,
        totalStock: 9999, // Services have unlimited "stock"
        salePrice: bp ? bp.salePrice : 0,
        averageCost: 0,
        categoryId: sp.categoryId,
        type: 'service'
      });
    });

    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createSale = async (req, res, next) => {
  const { clientId, paymentMethod, items, splitCash, splitCard, splitCredit, cardTransactionRef } = req.body;
  const activeTurn = req.activeTurn;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'La venta debe contener al menos un producto.' });
  }

  if (!paymentMethod || !['cash', 'credit', 'card', 'split'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'Método de pago no válido.' });
  }

  // Validate card transaction ref when card payment is involved
  const hasCardPayment = paymentMethod === 'card' || (paymentMethod === 'split' && parseFloat(splitCard) > 0);
  if (hasCardPayment && (!cardTransactionRef || cardTransactionRef.trim() === '')) {
    return res.status(400).json({ success: false, message: 'Debe ingresar el número de transacción de tarjeta.' });
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

      // Load product to check type
      const product = await Product.findByPk(productId, { transaction });
      if (!product) {
        throw new Error(`Producto ID ${productId} no encontrado.`);
      }

      const isService = product.type === 'service';

      if (isService) {
        // --- SERVICE PRODUCT: No stock/batch validation ---
        const branchProduct = await BranchProduct.findOne({
          where: { branchId: req.user.branchId, productId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        const itemPrice = item.unitPrice ? parseFloat(item.unitPrice) : (branchProduct ? parseFloat(branchProduct.salePrice) : 0);
        
        if (itemPrice <= 0) {
          throw new Error(`El servicio "${product.name}" debe tener un precio válido.`);
        }

        // Evaluate applicable promotion
        let promo = promotions.find(p => p.productId === product.id);
        if (!promo && product.categoryId) {
          promo = promotions.find(p => p.categoryId === product.categoryId);
        }

        let lineDiscount = 0.00;
        if (promo) {
          if (promo.type === 'percentage') {
            lineDiscount = itemPrice * (parseFloat(promo.value) / 100) * quantity;
          } else if (promo.type === 'fixed_price') {
            const promoPrice = parseFloat(promo.value);
            if (promoPrice < itemPrice) {
              lineDiscount = (itemPrice - promoPrice) * quantity;
            }
          }
        }

        totalAmount += (itemPrice * quantity) - lineDiscount;
        totalDiscount += lineDiscount;

        saleDetailsToCreate.push({
          productId,
          batchId: null,
          quantity,
          unitPrice: itemPrice,
          discountAmount: lineDiscount,
          unitCostAtSale: 0,
          customDescription: item.customDescription || null
        });

      } else {
        // --- PHYSICAL PRODUCT: Full stock/batch validation ---
        const branchProduct = await BranchProduct.findOne({
          where: { branchId: req.user.branchId, productId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!branchProduct || branchProduct.totalStock < quantity) {
          throw new Error(`Stock insuficiente para el producto: ${product.name}`);
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
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        let remainingToExhaust = quantity;
        const itemPrice = parseFloat(branchProduct.salePrice);
        
        // Evaluate applicable promotion
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

        // Accumulate net total
        totalAmount += (itemPrice * quantity) - lineDiscount;
        totalDiscount += lineDiscount;

        for (const batch of batches) {
          const toTake = Math.min(remainingToExhaust, batch.currentQuantity);
          
          batch.currentQuantity -= toTake;
          await batch.save({ transaction });

          // Prorate discount across batch
          const batchDiscount = lineDiscount * (toTake / quantity);

          saleDetailsToCreate.push({
            productId,
            batchId: batch.id,
            quantity: toTake,
            unitPrice: itemPrice,
            discountAmount: batchDiscount,
            unitCostAtSale: parseFloat(batch.unitCost),
            customDescription: null
          });

          remainingToExhaust -= toTake;
          if (remainingToExhaust === 0) break;
        }

        if (remainingToExhaust > 0) {
          throw new Error(`Inconsistencia de stock en lotes para el producto: ${product.name}`);
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
      client = await Client.findByPk(clientId, { 
        transaction,
        lock: transaction.LOCK.UPDATE
      });
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
      amountCredit,
      cardTransactionRef: hasCardPayment ? cardTransactionRef.trim() : null
    }, { transaction });

    // Save details in bulk
    await SaleDetail.bulkCreate(
      saleDetailsToCreate.map(detail => ({
        saleId: sale.id,
        ...detail
      })),
      { transaction }
    );

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'pos.sale_created',
      details: { ticketNumber, totalAmount, paymentMethod, clientId: sale.clientId, amountCash, amountCard, amountCredit, cardTransactionRef: sale.cardTransactionRef },
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

const renderSaleDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findByPk(id, {
      include: [
        { model: Client, as: 'client' },
        { model: require('../../modules/users/User'), as: 'user' },
        { model: require('../../modules/branches/Branch'), as: 'branch' },
        {
          model: SaleDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
    }

    if (req.user.roleId !== 'admin' && sale.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver ventas de otra sucursal.' });
    }

    return res.json({ success: true, sale });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const voidSale = async (req, res, next) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const sale = await Sale.findByPk(id, {
      include: [{ model: SaleDetail, as: 'details' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sale) {
      throw new Error('Venta no encontrada.');
    }

    if (req.user.roleId !== 'admin' && sale.branchId !== req.user.branchId) {
      throw new Error('No tienes permiso para anular tickets de otras sucursales.');
    }

    // 1. Revert inventory quantities (only for physical products with batches)
    for (const detail of sale.details) {
      if (detail.batchId) {
        // Revert ProductBatch
        const batch = await ProductBatch.findByPk(detail.batchId, { 
          transaction,
          lock: transaction.LOCK.UPDATE 
        });
        if (batch) {
          batch.currentQuantity += detail.quantity;
          await batch.save({ transaction });
        }
      }

      // Check if product is physical before reverting stock
      const product = await Product.findByPk(detail.productId, { transaction });
      if (product && product.type === 'physical') {
        // Revert BranchProduct
        const branchProduct = await BranchProduct.findOne({
          where: { branchId: sale.branchId, productId: detail.productId },
          transaction,
          lock: transaction.LOCK.UPDATE
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
    }

    // 2. Revert Client credit balance if applicable
    if (sale.clientId && (parseFloat(sale.amountCredit) > 0 || sale.paymentMethod === 'credit')) {
      const client = await Client.findByPk(sale.clientId, { 
        transaction,
        lock: transaction.LOCK.UPDATE 
      });
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

const renderSaleDetailPage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sale = await Sale.findByPk(id, {
      include: [
        { model: Client, as: 'client' },
        { model: require('../../modules/users/User'), as: 'user' },
        { model: require('../../modules/branches/Branch'), as: 'branch' },
        {
          model: SaleDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        }
      ]
    });

    if (!sale) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Venta no encontrada.',
        user: req.user
      });
    }

    if (req.user.roleId !== 'admin' && sale.branchId !== req.user.branchId) {
      return res.status(403).render('pages/error', {
        title: 'Error',
        message: 'No tienes permiso para ver ventas de otra sucursal.',
        user: req.user
      });
    }

    return res.render('pages/sales/sale-detail', {
      title: `Ticket #${sale.ticketNumber || sale.id}`,
      sale
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  renderPOS,
  renderPOSTouch,
  renderCustomerDisplay,
  searchProducts,
  createSale,
  renderHistory,
  renderSaleDetail,
  renderSaleDetailPage,
  voidSale
};
