const { Purchase, PurchaseDetail, PurchaseOrder, PurchaseOrderDetail, Supplier, Product, BranchProduct, ProductBatch, Branch, Category, CashierTurn, User, CashierMovement, SupplierPayment, Sale } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');

/**
 * Helper: Calculate the current available cash balance for a given cashier turn.
 */
const calculateTurnBalance = async (turn, transaction = null) => {
  const queryOpts = transaction ? { where: { turnId: turn.id }, transaction } : { where: { turnId: turn.id } };

  const movements = await CashierMovement.findAll(queryOpts);
  const sales = await Sale.findAll(queryOpts);

  const totalDeposits = movements
    .filter(m => m.type === 'deposit')
    .reduce((sum, m) => sum + parseFloat(m.amount), 0);

  const totalWithdrawals = movements
    .filter(m => m.type === 'withdrawal')
    .reduce((sum, m) => sum + parseFloat(m.amount), 0);

  const totalCashSales = sales.reduce((sum, s) => {
    const cashAmt = parseFloat(s.amountCash);
    if (cashAmt === 0 && s.paymentMethod === 'cash') {
      return sum + parseFloat(s.totalAmount);
    }
    return sum + cashAmt;
  }, 0);

  return parseFloat(turn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;
};

const listPurchases = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    const purchases = await Purchase.findAll({
      where: whereClause,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.render('pages/purchases/index', {
      title: 'Registro de Compras',
      purchases
    });
  } catch (error) {
    return next(error);
  }
};

const renderNewPurchase = async (req, res, next) => {
  try {
    const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });
    const products = await Product.findAll({ order: [['name', 'ASC']] });
    const categories = await Category.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/purchases/new', {
      title: 'Ingresar Compra (Abastecer)',
      suppliers,
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

const createPurchase = async (req, res, next) => {
  const { invoiceNumber, supplierId, items, paymentMethod, dueDate, paymentSource, turnId, transactionRef } = req.body;

  if (!invoiceNumber || invoiceNumber.trim() === '' || !supplierId) {
    return res.status(400).json({ success: false, message: 'El número de factura y el proveedor son obligatorios.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe ingresar al menos un producto a la compra.' });
  }

  const payMethod = paymentMethod || 'cash';
  if (!['cash', 'credit'].includes(payMethod)) {
    return res.status(400).json({ success: false, message: 'Método de pago de compra no válido.' });
  }

  if (payMethod === 'cash') {
    if (!paymentSource || !['cashier', 'external'].includes(paymentSource)) {
      return res.status(400).json({ success: false, message: 'Debe especificar el origen del pago (Efectivo de caja o Depósito/Transferencia).' });
    }
    if (paymentSource === 'cashier' && !turnId) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar una caja abierta para realizar el retiro de efectivo.' });
    }
    if (paymentSource === 'external' && (!transactionRef || transactionRef.trim() === '')) {
      return res.status(400).json({ success: false, message: 'Debe proporcionar el número de autorización o Voucher para el depósito/transferencia.' });
    }
  }

  const transaction = await sequelize.transaction();

  try {
    let totalAmount = 0;
    
    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const quantity = parseInt(item.quantity, 10);
      const unitCost = parseFloat(item.unitCost);
      const salePrice = parseFloat(item.salePrice);
      const batchCode = item.batchCode ? item.batchCode.trim() : '';

      if (isNaN(productId) || isNaN(quantity) || quantity <= 0 || isNaN(unitCost) || unitCost < 0 || isNaN(salePrice) || salePrice < 0 || batchCode === '') {
        throw new Error('Todos los campos de los artículos de compra son requeridos, incluyendo lote y precios válidos.');
      }

      totalAmount += unitCost * quantity;
    }

    let selectedTurn = null;
    if (payMethod === 'cash' && paymentSource === 'cashier') {
      selectedTurn = await CashierTurn.findOne({
        where: {
          id: parseInt(turnId, 10),
          branchId: req.user.branchId,
          status: 'open'
        },
        transaction
      });

      if (!selectedTurn) {
        throw new Error('La caja seleccionada no existe o no está abierta en esta sucursal.');
      }

      // Validate cash register balance is sufficient
      const currentBalance = await calculateTurnBalance(selectedTurn, transaction);
      if (currentBalance < totalAmount) {
        throw new Error(`Saldo insuficiente en la caja ${selectedTurn.boxName}. Saldo disponible: $${currentBalance.toFixed(2)}, requerido: $${totalAmount.toFixed(2)}.`);
      }
    }

    const purchase = await Purchase.create({
      invoiceNumber: invoiceNumber.trim(),
      supplierId: parseInt(supplierId, 10),
      branchId: req.user.branchId,
      totalAmount,
      paymentMethod: payMethod,
      paymentStatus: payMethod === 'credit' ? 'pending' : 'paid',
      amountPaid: payMethod === 'credit' ? 0.00 : totalAmount,
      dueDate: payMethod === 'credit' && dueDate && dueDate.trim() !== '' ? dueDate.trim() : null,
      paymentSource: payMethod === 'cash' ? paymentSource : null,
      turnId: selectedTurn ? selectedTurn.id : null,
      transactionRef: payMethod === 'cash' && paymentSource === 'external' ? transactionRef.trim() : null
    }, { transaction });

    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const quantity = parseInt(item.quantity, 10);
      const unitCost = parseFloat(item.unitCost);
      const salePrice = parseFloat(item.salePrice);
      const batchCode = item.batchCode && item.batchCode.trim() !== '' ? item.batchCode.trim() : `LOTE-${Date.now()}`;
      const expirationDate = item.expirationDate && item.expirationDate.trim() !== '' ? item.expirationDate : null;

      // 1. Create ProductBatch
      await ProductBatch.create({
        branchId: req.user.branchId,
        productId,
        batchCode,
        expirationDate,
        initialQuantity: quantity,
        currentQuantity: quantity,
        unitCost
      }, { transaction });

      // Log Kardex
      const { logKardex } = require('../inventory/kardexService');
      await logKardex({
        productId,
        branchId: req.user.branchId,
        userId: req.user.id,
        quantity,
        isInput: true,
        type: 'purchase',
        description: `Compra - Factura Proveedor #${invoiceNumber}`,
        transaction
      });

      // 2. Find or Create BranchProduct
      let branchProduct = await BranchProduct.findOne({
        where: { branchId: req.user.branchId, productId },
        transaction
      });

      if (branchProduct) {
        const currentStock = branchProduct.totalStock;
        const currentAvgCost = parseFloat(branchProduct.averageCost);
        const newStock = currentStock + quantity;
        
        let newAvgCost = unitCost;
        if (newStock > 0) {
          newAvgCost = ((currentStock * currentAvgCost) + (quantity * unitCost)) / newStock;
        }

        await branchProduct.update({
          totalStock: newStock,
          averageCost: newAvgCost,
          salePrice: salePrice
        }, { transaction });
      } else {
        await BranchProduct.create({
          branchId: req.user.branchId,
          productId,
          totalStock: quantity,
          averageCost: unitCost,
          salePrice
        }, { transaction });
      }

      // 3. Create PurchaseDetail
      await PurchaseDetail.create({
        purchaseId: purchase.id,
        productId,
        batchCode,
        expirationDate,
        quantity,
        unitCost
      }, { transaction });
    }

    // 4. Create Cashier Withdrawal if cash cashier payment
    if (payMethod === 'cash' && paymentSource === 'cashier' && selectedTurn) {
      await CashierMovement.create({
        turnId: selectedTurn.id,
        type: 'withdrawal',
        amount: totalAmount,
        reason: `Compra - Proveedor: Factura #${invoiceNumber}`
      }, { transaction });
    }

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'purchases.created',
      details: { invoiceNumber, supplierId, totalAmount, purchaseId: purchase.id, paymentMethod: payMethod, paymentSource, turnId: selectedTurn?.id },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Compra ingresada correctamente al inventario.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const renderSupplierPayments = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };

    const purchases = await Purchase.findAll({
      where: {
        ...whereClause,
        paymentMethod: 'credit'
      },
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        { model: SupplierPayment, as: 'payments' }
      ],
      order: [['createdAt', 'DESC']]
    });

    const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/purchases/payments', {
      title: 'Cuentas por Pagar (CxP)',
      purchases,
      suppliers,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const paySupplier = async (req, res, next) => {
  const { purchaseId, amountPaid, notes, paymentSource, turnId, transactionRef } = req.body;

  const parsedAmount = parseFloat(amountPaid);
  if (!purchaseId || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'El ID de compra y un monto de pago mayor a cero son obligatorios.' });
  }

  if (!paymentSource || !['cashier', 'external'].includes(paymentSource)) {
    return res.status(400).json({ success: false, message: 'Debe especificar el método de pago (Efectivo de caja o Depósito/Transferencia).' });
  }

  if (paymentSource === 'cashier' && !turnId) {
    return res.status(400).json({ success: false, message: 'Debe seleccionar una caja abierta para retirar el efectivo.' });
  }

  if (paymentSource === 'external' && (!transactionRef || transactionRef.trim() === '')) {
    return res.status(400).json({ success: false, message: 'Debe proporcionar el número de Voucher o Autorización.' });
  }

  const transaction = await sequelize.transaction();

  try {
    const purchase = await Purchase.findByPk(purchaseId, { transaction });
    if (!purchase) {
      throw new Error('Compra no encontrada.');
    }

    if (purchase.paymentStatus === 'paid') {
      throw new Error('Esta compra ya ha sido liquidada por completo.');
    }

    const currentPaid = parseFloat(purchase.amountPaid || 0);
    const totalAmount = parseFloat(purchase.totalAmount);
    const remaining = totalAmount - currentPaid;

    if (parsedAmount > remaining + 0.01) {
      throw new Error(`El pago ingresado ($${parsedAmount.toFixed(2)}) supera el saldo pendiente ($${remaining.toFixed(2)}).`);
    }

    let selectedTurn = null;
    if (paymentSource === 'cashier') {
      selectedTurn = await CashierTurn.findOne({
        where: {
          id: parseInt(turnId, 10),
          branchId: req.user.branchId,
          status: 'open'
        },
        transaction
      });

      if (!selectedTurn) {
        throw new Error('La caja seleccionada no existe o no está abierta en esta sucursal.');
      }

      // Validate cash register balance is sufficient for this installment
      const currentBalance = await calculateTurnBalance(selectedTurn, transaction);
      if (currentBalance < parsedAmount) {
        throw new Error(`Saldo insuficiente en la caja ${selectedTurn.boxName}. Saldo disponible: $${currentBalance.toFixed(2)}, abono requerido: $${parsedAmount.toFixed(2)}.`);
      }
    }

    // 1. Create SupplierPayment record
    const payment = await SupplierPayment.create({
      purchaseId,
      amountPaid: parsedAmount,
      paymentDate: new Date(),
      notes: notes ? notes.trim() : null,
      paymentSource,
      turnId: selectedTurn ? selectedTurn.id : null,
      transactionRef: paymentSource === 'external' ? transactionRef.trim() : null
    }, { transaction });

    // 2. Update Purchase headers
    const newPaidAmount = currentPaid + parsedAmount;
    const isPaid = Math.abs(newPaidAmount - totalAmount) < 0.01 || newPaidAmount >= totalAmount;

    await purchase.update({
      amountPaid: newPaidAmount,
      paymentStatus: isPaid ? 'paid' : 'pending'
    }, { transaction });

    // 3. Create Cashier Withdrawal if cashier payment
    if (paymentSource === 'cashier' && selectedTurn) {
      await CashierMovement.create({
        turnId: selectedTurn.id,
        type: 'withdrawal',
        amount: parsedAmount,
        reason: `Abono a Compra - Factura Proveedor #${purchase.invoiceNumber}`
      }, { transaction });
    }

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'purchases.supplier_payment_created',
      details: { purchaseId, amountPaid: parsedAmount, notes, paymentSource, turnId: selectedTurn?.id, paymentId: payment.id },
      ipAddress: req.ip
    }, { transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Pago registrado y saldo actualizado correctamente.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getAvailableTurns = async (req, res, next) => {
  try {
    const openTurns = await CashierTurn.findAll({
      where: {
        branchId: req.user.branchId,
        status: 'open'
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'username'] }],
      order: [['openedAt', 'ASC']]
    });

    const turnsData = [];
    for (const turn of openTurns) {
      const balance = await calculateTurnBalance(turn);
      turnsData.push({
        id: turn.id,
        boxName: turn.boxName,
        userId: turn.userId,
        userName: turn.user ? turn.user.fullName : 'Desconocido',
        balance: parseFloat(balance.toFixed(2)),
        isOwn: turn.userId === req.user.id
      });
    }

    // Sort: own turn first, then by balance descending
    turnsData.sort((a, b) => {
      if (a.isOwn && !b.isOwn) return -1;
      if (!a.isOwn && b.isOwn) return 1;
      return b.balance - a.balance;
    });

    return res.json({ success: true, turns: turnsData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const renderPurchaseDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    const purchase = await Purchase.findOne({
      where: { id, ...whereClause },
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        {
          model: PurchaseDetail,
          as: 'details',
          include: [{ model: Product, as: 'product' }]
        },
        {
          model: SupplierPayment,
          as: 'payments'
        }
      ]
    });

    if (!purchase) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Compra no encontrada o no pertenece a su sucursal.',
        user: req.user
      });
    }

    return res.render('pages/purchases/detail', {
      title: `Detalle de Compra #${purchase.invoiceNumber}`,
      purchase
    });
  } catch (error) {
    return next(error);
  }
};

const listOrders = async (req, res, next) => {
  try {
    const { Op } = require('sequelize');
    const branchWhere = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    // Parse date filters: default to current month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const defaultStart = `${year}-${month}-01`;
    const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const defaultEnd = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const startDate = req.query.startDate ? req.query.startDate.trim() : defaultStart;
    const endDate = req.query.endDate ? req.query.endDate.trim() : defaultEnd;

    // Build filter for orders (by orderDate)
    const orderDateWhere = {
      ...branchWhere,
      orderDate: {
        [Op.between]: [startDate, endDate]
      }
    };

    const orders = await PurchaseOrder.findAll({
      where: orderDateWhere,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        { model: Purchase, as: 'purchase' },
        { model: PurchaseOrderDetail, as: 'details', include: [{ model: Product, as: 'product' }] }
      ],
      order: [['orderDate', 'DESC'], ['createdAt', 'DESC']]
    });

    // Also query all orders for calendar event continuity
    const allOrders = await PurchaseOrder.findAll({
      where: branchWhere,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        { model: Purchase, as: 'purchase' },
        { model: PurchaseOrderDetail, as: 'details', include: [{ model: Product, as: 'product' }] }
      ],
      order: [['orderDate', 'DESC'], ['createdAt', 'DESC']]
    });

    // Build filter for purchases in the date range
    const startDateTime = new Date(`${startDate}T00:00:00`);
    const endDateTime = new Date(`${endDate}T23:59:59.999`);

    const purchaseWhere = {
      ...branchWhere,
      createdAt: {
        [Op.between]: [startDateTime, endDateTime]
      }
    };

    const purchases = await Purchase.findAll({
      where: purchaseWhere,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate totals
    const totalPurchasesAmount = purchases.reduce((sum, p) => sum + parseFloat(p.totalAmount || 0), 0);
    const totalOrdersAmount = orders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    const pendingOrdersAmount = orders.filter(o => o.status === 'pending').reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    const receivedOrdersAmount = orders.filter(o => o.status === 'received').reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    
    // Gran Total Invertido: Facturas de Compras + Pedidos Pendientes
    const grandTotalInvested = totalPurchasesAmount + pendingOrdersAmount;

    // Prepare Chart Dataset: group by date
    const dateMap = {};
    let cur = new Date(`${startDate}T00:00:00`);
    const endLimit = new Date(`${endDate}T00:00:00`);
    
    let count = 0;
    while (cur <= endLimit && count < 366) {
      const dStr = cur.toISOString().split('T')[0];
      dateMap[dStr] = { purchases: 0, orders: 0 };
      cur.setDate(cur.getDate() + 1);
      count++;
    }

    purchases.forEach(p => {
      const dStr = new Date(p.createdAt).toISOString().split('T')[0];
      if (dateMap[dStr]) {
        dateMap[dStr].purchases += parseFloat(p.totalAmount || 0);
      } else {
        dateMap[dStr] = { purchases: parseFloat(p.totalAmount || 0), orders: 0 };
      }
    });

    orders.forEach(o => {
      const dStr = o.orderDate;
      if (dateMap[dStr]) {
        dateMap[dStr].orders += parseFloat(o.totalAmount || 0);
      } else {
        dateMap[dStr] = { purchases: 0, orders: parseFloat(o.totalAmount || 0) };
      }
    });

    const sortedDates = Object.keys(dateMap).sort();
    const chartLabels = sortedDates;
    const chartPurchases = sortedDates.map(d => parseFloat(dateMap[d].purchases.toFixed(2)));
    const chartOrders = sortedDates.map(d => parseFloat(dateMap[d].orders.toFixed(2)));

    const products = await Product.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/purchases/orders', {
      title: 'Pedidos a Proveedores y Calendario',
      orders,
      allOrders,
      purchases,
      startDate,
      endDate,
      stats: {
        grandTotalInvested,
        totalPurchasesAmount,
        totalOrdersAmount,
        pendingOrdersAmount,
        receivedOrdersAmount,
        ordersCount: orders.length,
        purchasesCount: purchases.length,
        pendingCount: orders.filter(o => o.status === 'pending').length,
        receivedCount: orders.filter(o => o.status === 'received').length
      },
      chartData: {
        labels: chartLabels,
        purchases: chartPurchases,
        orders: chartOrders
      },
      products
    });
  } catch (error) {
    return next(error);
  }
};

const renderNewOrder = async (req, res, next) => {
  try {
    const suppliers = await Supplier.findAll({ order: [['name', 'ASC']] });
    const products = await Product.findAll({ order: [['name', 'ASC']] });
    const branches = await Branch.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/purchases/order-new', {
      title: 'Registrar Nuevo Pedido',
      suppliers,
      products,
      branches
    });
  } catch (error) {
    return next(error);
  }
};

const createOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { supplierId, branchId, orderDate, expectedDeliveryDate, notes, items } = req.body;

    if (!supplierId || !orderDate || !expectedDeliveryDate) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Proveedor, fecha de pedido y fecha estimada de entrega son obligatorios.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Debe agregar al menos un producto al pedido.' });
    }

    const orderBranchId = req.user.roleId === 'admin' ? (branchId || req.user.branchId) : req.user.branchId;

    let totalAmount = 0;
    const orderDetailsData = [];

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      const cost = parseFloat(item.unitCost);
      if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Cantidad o costo unitario inválido en los ítems.' });
      }
      const subtotal = qty * cost;
      totalAmount += subtotal;

      orderDetailsData.push({
        productId: item.productId,
        quantity: qty,
        unitCost: cost,
        subtotal: subtotal
      });
    }

    const orderNumber = `PED-${Date.now().toString().slice(-6)}`;

    const newOrder = await PurchaseOrder.create({
      orderNumber,
      supplierId,
      branchId: orderBranchId,
      totalAmount,
      status: 'pending',
      orderDate,
      expectedDeliveryDate,
      notes: notes || null
    }, { transaction: t });

    for (const detail of orderDetailsData) {
      detail.purchaseOrderId = newOrder.id;
      await PurchaseOrderDetail.create(detail, { transaction: t });
    }

    await t.commit();
    await logAction(req.user.id, 'CREATE_PURCHASE_ORDER', `Pedido #${orderNumber} registrado por $${totalAmount.toFixed(2)}`, req);

    return res.json({ success: true, message: 'Pedido registrado con éxito.', orderId: newOrder.id });
  } catch (error) {
    await t.rollback();
    return next(error);
  }
};

const receiveOrder = async (req, res, next) => {
  const { invoiceNumber, paymentMethod, dueDate, paymentSource, turnId, transactionRef, items } = req.body;

  if (!invoiceNumber || invoiceNumber.trim() === '') {
    return res.status(400).json({ success: false, message: 'El número de factura es obligatorio al recibir el pedido.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe ingresar al menos un producto a la recepción.' });
  }

  const payMethod = paymentMethod || 'cash';
  if (!['cash', 'credit'].includes(payMethod)) {
    return res.status(400).json({ success: false, message: 'Método de pago no válido.' });
  }

  if (payMethod === 'cash') {
    if (!paymentSource || !['cashier', 'external'].includes(paymentSource)) {
      return res.status(400).json({ success: false, message: 'Debe especificar el origen del pago en efectivo.' });
    }
    if (paymentSource === 'cashier' && !turnId) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar una caja abierta para el retiro de efectivo.' });
    }
    if (paymentSource === 'external' && (!transactionRef || transactionRef.trim() === '')) {
      return res.status(400).json({ success: false, message: 'Debe proporcionar la referencia o voucher del depósito/banco.' });
    }
  }

  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const order = await PurchaseOrder.findByPk(id, { transaction: t });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Pedido no encontrado.' });
    }

    if (order.status === 'received') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Este pedido ya fue marcado como recibido anteriormente.' });
    }

    let totalAmount = 0;
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      const cost = parseFloat(item.unitCost);
      if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Cantidad o costo unitario inválido en los ítems recibidos.' });
      }
      totalAmount += qty * cost;
    }

    let selectedTurn = null;
    if (payMethod === 'cash' && paymentSource === 'cashier') {
      selectedTurn = await CashierTurn.findOne({
        where: {
          id: parseInt(turnId, 10),
          branchId: order.branchId,
          status: 'open'
        },
        transaction: t
      });

      if (!selectedTurn) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'La caja seleccionada no existe o no está abierta en esta sucursal.' });
      }

      const currentBalance = await calculateTurnBalance(selectedTurn, t);
      if (currentBalance < totalAmount) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Saldo insuficiente en la caja ${selectedTurn.boxName}. Disponible: $${currentBalance.toFixed(2)}, Requerido: $${totalAmount.toFixed(2)}.` });
      }
    }

    // 2. Create Purchase record linked to PurchaseOrder
    const newPurchase = await Purchase.create({
      invoiceNumber: invoiceNumber.trim(),
      supplierId: order.supplierId,
      branchId: order.branchId,
      totalAmount,
      paymentMethod: payMethod,
      paymentStatus: payMethod === 'credit' ? 'pending' : 'paid',
      amountPaid: payMethod === 'credit' ? 0.00 : totalAmount,
      dueDate: payMethod === 'credit' && dueDate && dueDate.trim() !== '' ? dueDate.trim() : null,
      paymentSource: payMethod === 'cash' ? paymentSource : null,
      turnId: selectedTurn ? selectedTurn.id : null,
      transactionRef: payMethod === 'cash' && paymentSource === 'external' ? transactionRef.trim() : null,
      purchaseOrderId: order.id
    }, { transaction: t });

    // Link Purchase back to PurchaseOrder
    order.status = 'received';
    order.totalAmount = totalAmount;
    order.purchaseId = newPurchase.id;
    await order.save({ transaction: t });

    // Cashier Movement if paid from caja chica
    if (selectedTurn) {
      await CashierMovement.create({
        turnId: selectedTurn.id,
        userId: req.user.id,
        type: 'withdrawal',
        amount: totalAmount,
        reason: `Recepción de Pedido #${order.orderNumber} - Factura #${invoiceNumber.trim()}`
      }, { transaction: t });
    }

    // 3. Process items
    const { logKardex } = require('../inventory/kardexService');

    for (const item of items) {
      const productId = parseInt(item.productId, 10);
      const quantity = parseInt(item.quantity, 10);
      const unitCost = parseFloat(item.unitCost);
      const salePrice = parseFloat(item.salePrice || 0);
      const batchCode = item.batchCode && item.batchCode.trim() !== '' ? item.batchCode.trim() : `LOTE-${order.orderNumber}`;
      const expirationDate = item.expirationDate && item.expirationDate.trim() !== '' ? item.expirationDate.trim() : null;
      const subtotal = quantity * unitCost;

      // PurchaseDetail
      await PurchaseDetail.create({
        purchaseId: newPurchase.id,
        productId,
        batchCode,
        expirationDate,
        quantity,
        unitCost
      }, { transaction: t });

      // ProductBatch
      await ProductBatch.create({
        branchId: order.branchId,
        productId,
        batchCode,
        expirationDate,
        initialQuantity: quantity,
        currentQuantity: quantity,
        unitCost
      }, { transaction: t });

      // Log Kardex
      await logKardex({
        productId,
        branchId: order.branchId,
        userId: req.user.id,
        quantity,
        isInput: true,
        type: 'purchase',
        description: `Recepción de Pedido #${order.orderNumber} - Factura #${invoiceNumber.trim()}`,
        transaction: t
      });

      // BranchProduct
      let branchProduct = await BranchProduct.findOne({
        where: { branchId: order.branchId, productId },
        transaction: t
      });

      if (branchProduct) {
        const currentStock = branchProduct.totalStock;
        const currentAvgCost = parseFloat(branchProduct.averageCost);
        const newStock = currentStock + quantity;
        let newAvgCost = unitCost;
        if (newStock > 0) {
          newAvgCost = ((currentStock * currentAvgCost) + (quantity * unitCost)) / newStock;
        }

        await branchProduct.update({
          totalStock: newStock,
          averageCost: newAvgCost,
          salePrice: salePrice > 0 ? salePrice : branchProduct.salePrice
        }, { transaction: t });
      } else {
        await BranchProduct.create({
          branchId: order.branchId,
          productId,
          totalStock: quantity,
          averageCost: unitCost,
          salePrice
        }, { transaction: t });
      }
    }

    await t.commit();
    await logAction(req.user.id, 'RECEIVE_PURCHASE_ORDER', `Pedido #${order.orderNumber} recibido como Factura #${invoiceNumber.trim()} por $${totalAmount.toFixed(2)}`, req);

    return res.json({ success: true, message: 'Pedido recibido e ingresado al inventario con éxito.' });
  } catch (error) {
    await t.rollback();
    return next(error);
  }
};

const getOrderCalendarEvents = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    const orders = await PurchaseOrder.findAll({
      where: whereClause,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        { model: PurchaseOrderDetail, as: 'details', include: [{ model: Product, as: 'product' }] }
      ]
    });

    const events = [];
    orders.forEach(o => {
      const supplierName = o.supplier ? o.supplier.name : 'Proveedor';

      events.push({
        id: `order-placed-${o.id}`,
        title: `🛒 Pedido ${o.orderNumber} - ${supplierName} ($${parseFloat(o.totalAmount).toFixed(2)})`,
        start: o.orderDate,
        type: 'order_date',
        orderNumber: o.orderNumber,
        supplierName,
        totalAmount: o.totalAmount,
        status: o.status,
        color: '#3b82f6',
        details: o.details.map(d => ({
          productName: d.product ? d.product.name : 'Producto',
          quantity: d.quantity,
          unitCost: d.unitCost,
          subtotal: d.subtotal
        }))
      });

      events.push({
        id: `order-delivery-${o.id}`,
        title: `📦 Llega Pedido ${o.orderNumber} - ${supplierName}`,
        start: o.expectedDeliveryDate,
        type: 'delivery_date',
        orderNumber: o.orderNumber,
        supplierName,
        totalAmount: o.totalAmount,
        status: o.status,
        color: o.status === 'received' ? '#10b981' : (o.status === 'cancelled' ? '#6b7280' : '#f59e0b'),
        details: o.details.map(d => ({
          productName: d.product ? d.product.name : 'Producto',
          quantity: d.quantity,
          unitCost: d.unitCost,
          subtotal: d.subtotal
        }))
      });
    });

    return res.json(events);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPurchases,
  renderNewPurchase,
  createPurchase,
  renderSupplierPayments,
  paySupplier,
  renderPurchaseDetail,
  getAvailableTurns,
  listOrders,
  renderNewOrder,
  createOrder,
  receiveOrder,
  getOrderCalendarEvents
};
