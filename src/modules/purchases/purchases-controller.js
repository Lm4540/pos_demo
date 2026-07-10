const { Purchase, PurchaseDetail, Supplier, Product, BranchProduct, ProductBatch, Branch, Category, CashierTurn, User, CashierMovement, SupplierPayment, Sale } = require('../../core/models');
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
      error: null
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
      const batchCode = item.batchCode.trim();
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

module.exports = {
  listPurchases,
  renderNewPurchase,
  createPurchase,
  renderSupplierPayments,
  paySupplier,
  renderPurchaseDetail,
  getAvailableTurns
};
