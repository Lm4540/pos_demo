const { Client, CreditPayment, Sale, CashierMovement, Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');

const renderStatement = async (req, res, next) => {
  const { id } = req.params;
  try {
    const client = await Client.findByPk(id, {
      include: [{ model: Branch, as: 'branch' }]
    });

    if (!client) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Cliente no encontrado.',
        user: req.user
      });
    }

    if (req.user.roleId !== 'admin' && client.branchId !== req.user.branchId) {
      return res.status(403).render('pages/error', {
        title: 'Acceso Denegado',
        message: 'No tienes permisos para ver el estado de cuenta de este cliente.',
        user: req.user
      });
    }

    const creditSales = await Sale.findAll({
      where: { clientId: client.id, paymentMethod: 'credit' },
      order: [['createdAt', 'ASC']]
    });

    const creditPayments = await CreditPayment.findAll({
      where: { clientId: client.id },
      order: [['createdAt', 'ASC']]
    });

    const transactions = [];

    creditSales.forEach(s => {
      transactions.push({
        date: s.createdAt,
        type: 'charge',
        reference: s.ticketNumber,
        amount: parseFloat(s.totalAmount),
        description: 'Compra al Crédito'
      });
    });

    creditPayments.forEach(p => {
      transactions.push({
        date: p.createdAt,
        type: 'payment',
        reference: p.receiptNumber,
        amount: parseFloat(p.amountPaid),
        description: 'Abono Recibido'
      });
    });

    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    let cumulativeBalance = 0.00;
    transactions.forEach(t => {
      if (t.type === 'charge') {
        cumulativeBalance += t.amount;
      } else if (t.type === 'payment') {
        cumulativeBalance -= t.amount;
      }
      t.balance = cumulativeBalance;
    });

    return res.render('pages/cxc/statement', {
      title: `Estado de Cuenta - ${client.name}`,
      clientData: client,
      transactions
    });
  } catch (error) {
    return next(error);
  }
};

const registerPayment = async (req, res, next) => {
  const { id } = req.params;
  const { amountPaid } = req.body;
  const activeTurn = req.activeTurn;

  try {
    const client = await Client.findByPk(id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
    }

    if (req.user.roleId !== 'admin' && client.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para recibir abonos de clientes de otras sucursales.' });
    }

    const parsedAmount = parseFloat(amountPaid);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'El monto del abono debe ser un número válido mayor a cero.' });
    }

    const currentBalance = parseFloat(client.currentBalance);
    if (parsedAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `El abono ($${parsedAmount.toFixed(2)}) no puede ser mayor que la deuda actual ($${currentBalance.toFixed(2)}).`
      });
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `REC-${dateStr}-${rand}`;

    const transaction = await sequelize.transaction();

    try {
      const payment = await CreditPayment.create({
        receiptNumber,
        clientId: client.id,
        turnId: activeTurn.id,
        amountPaid: parsedAmount
      }, { transaction });

      client.currentBalance = currentBalance - parsedAmount;
      await client.save({ transaction });

      await CashierMovement.create({
        turnId: activeTurn.id,
        type: 'deposit',
        amount: parsedAmount,
        reason: `Abono de Cliente: ${client.name} (Recibo ${receiptNumber})`
      }, { transaction });

      await transaction.commit();

      await logAction({
        userId: req.user.id,
        branchId: req.user.branchId,
        action: 'cxc.payment_registered',
        details: { paymentId: payment.id, receiptNumber, clientId: client.id, amountPaid: parsedAmount },
        ipAddress: req.ip
      });

      return res.json({
        success: true,
        message: `Abono de $${parsedAmount.toFixed(2)} registrado correctamente.`,
        receiptNumber
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  renderStatement,
  registerPayment
};
