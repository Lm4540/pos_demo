const { Client, CreditPayment, Sale, CashierMovement, CashierTurn, Branch, User } = require('../../core/models');
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

/**
 * API endpoint: Returns all open cashier turns in the user's branch with their current balance.
 * Used by the payment modal to let the user select which cash register receives the cash deposit.
 */
const getAvailableTurns = async (req, res, next) => {
  try {
    const branchId = req.user.branchId;

    const openTurns = await CashierTurn.findAll({
      where: {
        branchId,
        status: 'open'
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'username'] }],
      order: [['openedAt', 'ASC']]
    });

    const turnsWithBalance = [];

    for (const turn of openTurns) {
      const balance = await calculateTurnBalance(turn);
      turnsWithBalance.push({
        id: turn.id,
        boxName: turn.boxName,
        userId: turn.userId,
        userName: turn.user ? turn.user.fullName : 'Desconocido',
        balance: parseFloat(balance.toFixed(2)),
        isOwn: turn.userId === req.user.id
      });
    }

    // Sort: own turn first, then by balance descending
    turnsWithBalance.sort((a, b) => {
      if (a.isOwn && !b.isOwn) return -1;
      if (!a.isOwn && b.isOwn) return 1;
      return b.balance - a.balance;
    });

    return res.json({ success: true, turns: turnsWithBalance });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const registerPayment = async (req, res, next) => {
  const { id } = req.params;
  const { amountPaid, paymentMethod, turnId } = req.body;

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

    // Validate payment method
    const isCash = paymentMethod === 'cash';
    const isBankDeposit = paymentMethod === 'bank_deposit';

    if (!isCash && !isBankDeposit) {
      return res.status(400).json({ success: false, message: 'Método de pago no válido. Seleccione Efectivo o Depósito Bancario.' });
    }

    // If cash, turnId is required
    if (isCash && !turnId) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar una caja para ingresar el efectivo.' });
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `REC-${dateStr}-${rand}`;

    const transaction = await sequelize.transaction();

    try {
      let selectedTurn = null;
      let cajaLabel = 'Depósito bancario (sin caja)';

      if (isCash) {
        // Validate selected turn
        selectedTurn = await CashierTurn.findOne({
          where: {
            id: parseInt(turnId),
            branchId: req.user.branchId,
            status: 'open'
          },
          include: [{ model: User, as: 'user', attributes: ['id', 'fullName'] }],
          transaction
        });

        if (!selectedTurn) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: 'La caja seleccionada no existe, no está abierta, o no pertenece a esta sucursal.' });
        }

        cajaLabel = `${selectedTurn.boxName} (${selectedTurn.user ? selectedTurn.user.fullName : ''})`;
      }

      const payment = await CreditPayment.create({
        receiptNumber,
        clientId: client.id,
        turnId: selectedTurn ? selectedTurn.id : null,
        amountPaid: parsedAmount
      }, { transaction });

      client.currentBalance = currentBalance - parsedAmount;
      await client.save({ transaction });

      // Only create cashier deposit if payment is cash
      if (isCash && selectedTurn) {
        await CashierMovement.create({
          turnId: selectedTurn.id,
          type: 'deposit',
          amount: parsedAmount,
          reason: `Abono de Cliente: ${client.name} (Recibo ${receiptNumber})`
        }, { transaction });
      }

      await transaction.commit();

      await logAction({
        userId: req.user.id,
        branchId: req.user.branchId,
        action: 'cxc.payment_registered',
        details: {
          paymentId: payment.id,
          receiptNumber,
          clientId: client.id,
          amountPaid: parsedAmount,
          paymentMethod: isCash ? 'cash' : 'bank_deposit',
          turnId: selectedTurn ? selectedTurn.id : null,
          cajaLabel
        },
        ipAddress: req.ip
      });

      const methodLabel = isCash ? `en efectivo (${cajaLabel})` : 'por depósito bancario';
      return res.json({
        success: true,
        message: `Abono de $${parsedAmount.toFixed(2)} registrado correctamente ${methodLabel}.`,
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
  registerPayment,
  getAvailableTurns
};
