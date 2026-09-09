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
    const branchWhere = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    const orders = await PurchaseOrder.findAll({
      where: branchWhere,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' }
      ],
      order: [['expectedDeliveryDate', 'ASC'], ['orderDate', 'ASC'], ['createdAt', 'DESC']]
    });

    const pendingOrders = orders.filter(o => o.status === 'pending');
    const receivedOrders = orders.filter(o => o.status === 'received');
    
    const totalAmount = orders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    const pendingAmount = pendingOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);
    const receivedAmount = receivedOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);

    return res.render('pages/purchases/orders', {
      title: 'Calendario de Órdenes de Compra',
      orders,
      stats: {
        totalCount: orders.length,
        pendingCount: pendingOrders.length,
        receivedCount: receivedOrders.length,
        totalAmount,
        pendingAmount,
        receivedAmount
      }
    });
  } catch (error) {
    return next(error);
  }
};

const renderNewOrder = async (req, res, next) => {
  return res.redirect('/purchases/orders');
};

const createOrder = async (req, res, next) => {
  try {
    const { supplierName, orderDate, expectedDeliveryDate, status, amount, notes, totalAmount } = req.body;

    const trimmedSupplier = supplierName ? supplierName.trim() : '';
    if (!trimmedSupplier) {
      return res.status(400).json({ success: false, message: 'El nombre del proveedor es obligatorio.' });
    }

    const validOrderDate = orderDate && orderDate.trim() !== '' ? orderDate.trim() : new Date().toISOString().split('T')[0];
    const validDeliveryDate = expectedDeliveryDate && expectedDeliveryDate.trim() !== '' ? expectedDeliveryDate.trim() : validOrderDate;
    const validStatus = status === 'received' || status === 'recibido' ? 'received' : 'pending';
    const parsedAmount = parseFloat(amount !== undefined ? amount : totalAmount) || 0.00;

    const orderNumber = `OC-${Date.now().toString().slice(-6)}`;
    const branchId = req.user.branchId || 1;

    const newOrder = await PurchaseOrder.create({
      orderNumber,
      supplierName: trimmedSupplier,
      branchId,
      totalAmount: parsedAmount,
      status: validStatus,
      orderDate: validOrderDate,
      expectedDeliveryDate: validDeliveryDate,
      notes: notes ? notes.trim() : null
    });

    return res.json({ success: true, message: 'Orden anotada con éxito en el calendario.', order: newOrder });
  } catch (error) {
    return next(error);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supplierName, orderDate, expectedDeliveryDate, status, amount, notes, totalAmount } = req.body;

    const order = await PurchaseOrder.findByPk(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Anotación de compra no encontrada.' });
    }

    const trimmedSupplier = supplierName ? supplierName.trim() : order.supplierName;
    const validOrderDate = orderDate && orderDate.trim() !== '' ? orderDate.trim() : order.orderDate;
    const validDeliveryDate = expectedDeliveryDate && expectedDeliveryDate.trim() !== '' ? expectedDeliveryDate.trim() : order.expectedDeliveryDate;
    const validStatus = status !== undefined ? (status === 'received' || status === 'recibido' ? 'received' : 'pending') : order.status;
    const parsedAmount = (amount !== undefined || totalAmount !== undefined) ? (parseFloat(amount !== undefined ? amount : totalAmount) || 0.00) : order.totalAmount;

    await order.update({
      supplierName: trimmedSupplier,
      orderDate: validOrderDate,
      expectedDeliveryDate: validDeliveryDate,
      status: validStatus,
      totalAmount: parsedAmount,
      notes: notes !== undefined ? (notes ? notes.trim() : null) : order.notes
    });

    return res.json({ success: true, message: 'Anotación de compra actualizada.', order });
  } catch (error) {
    return next(error);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await PurchaseOrder.findByPk(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Anotación no encontrada.' });
    }

    await order.destroy();
    return res.json({ success: true, message: 'Anotación eliminada con éxito.' });
  } catch (error) {
    return next(error);
  }
};

const toggleOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await PurchaseOrder.findByPk(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Anotación no encontrada.' });
    }

    const newStatus = order.status === 'received' ? 'pending' : 'received';
    await order.update({ status: newStatus });

    return res.json({
      success: true,
      message: `Estado cambiado a: ${newStatus === 'received' ? 'Recibido' : 'En espera'}.`,
      status: newStatus
    });
  } catch (error) {
    return next(error);
  }
};

const receiveOrder = async (req, res, next) => {
  return res.json({ success: true, message: 'Operación no requerida en modo simplificado.' });
};

const getOrderCalendarEvents = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    const orders = await PurchaseOrder.findAll({
      where: whereClause,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' }
      ],
      order: [['expectedDeliveryDate', 'ASC'], ['orderDate', 'ASC']]
    });

    const events = [];
    orders.forEach(o => {
      const name = o.supplierName || (o.supplier ? o.supplier.name : 'Proveedor');
      const isReceived = o.status === 'received';
      const eventDate = o.expectedDeliveryDate || o.orderDate;

      events.push({
        id: o.id,
        title: `${name} - $${parseFloat(o.totalAmount || 0).toFixed(2)}`,
        start: eventDate,
        orderDate: o.orderDate,
        expectedDeliveryDate: o.expectedDeliveryDate,
        supplierName: name,
        totalAmount: parseFloat(o.totalAmount || 0),
        status: o.status,
        statusLabel: isReceived ? 'Recibido' : 'En espera',
        color: isReceived ? '#10b981' : '#f59e0b',
        notes: o.notes || ''
      });
    });

    return res.json(events);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
  updateOrder,
  deleteOrder,
  toggleOrderStatus,
  receiveOrder,
  getOrderCalendarEvents
};
