const { Purchase, PurchaseDetail, Supplier, Product, BranchProduct, ProductBatch, Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');

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

    return res.render('pages/purchases/new', {
      title: 'Ingresar Compra (Abastecer)',
      suppliers,
      products,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createPurchase = async (req, res, next) => {
  const { invoiceNumber, supplierId, items, paymentMethod, dueDate } = req.body;

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

  const transaction = await sequelize.transaction();

  try {
    let totalAmount = 0;
    const purchaseDetailsToCreate = [];
    
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

    const purchase = await Purchase.create({
      invoiceNumber: invoiceNumber.trim(),
      supplierId: parseInt(supplierId, 10),
      branchId: req.user.branchId,
      totalAmount,
      paymentMethod: payMethod,
      paymentStatus: payMethod === 'credit' ? 'pending' : 'paid',
      amountPaid: payMethod === 'credit' ? 0.00 : totalAmount,
      dueDate: payMethod === 'credit' && dueDate && dueDate.trim() !== '' ? dueDate.trim() : null
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

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'purchases.created',
      details: { invoiceNumber, supplierId, totalAmount, purchaseId: purchase.id, paymentMethod: payMethod },
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
    const { SupplierPayment } = require('../../core/models');
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
  const { purchaseId, amountPaid, notes } = req.body;

  const parsedAmount = parseFloat(amountPaid);
  if (!purchaseId || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'El ID de compra y un monto de pago mayor a cero son obligatorios.' });
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

    const { SupplierPayment } = require('../../core/models');
    
    // 1. Create SupplierPayment record
    await SupplierPayment.create({
      purchaseId,
      amountPaid: parsedAmount,
      paymentDate: new Date(),
      notes: notes ? notes.trim() : null
    }, { transaction });

    // 2. Update Purchase headers
    const newPaidAmount = currentPaid + parsedAmount;
    const isPaid = Math.abs(newPaidAmount - totalAmount) < 0.01 || newPaidAmount >= totalAmount;

    await purchase.update({
      amountPaid: newPaidAmount,
      paymentStatus: isPaid ? 'paid' : 'pending'
    }, { transaction });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'purchases.supplier_payment_created',
      details: { purchaseId, amountPaid: parsedAmount, notes },
      ipAddress: req.ip
    }, { transaction });

    await transaction.commit();
    return res.json({ success: true, message: 'Pago registrado y saldo actualizado correctamente.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const renderPurchaseDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { SupplierPayment } = require('../../core/models');
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
  renderPurchaseDetail
};
