const { Expense, CashierMovement, CashierTurn, Sale, Branch, User } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');

/**
 * Helper: Calculate the current available cash balance for a given cashier turn.
 * Balance = openingAmount + deposits - withdrawals + cashSales
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

const listExpenses = async (req, res, next) => {
  try {
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };

    const expenses = await Expense.findAll({
      where: whereClause,
      include: [
        { model: Branch, as: 'branch' }
      ],
      order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']]
    });

    // Get the user's own active turn (if any)
    const ownActiveTurn = await CashierTurn.findOne({
      where: {
        userId: req.user.id,
        branchId: req.user.branchId,
        status: 'open'
      }
    });

    return res.render('pages/expenses/index', {
      title: 'Módulo de Gastos',
      expenses,
      hasOwnTurn: !!ownActiveTurn
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * API endpoint: Returns all open cashier turns in the user's branch with their current balance.
 * The user's own turn (if any) is marked and placed first.
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

const createExpense = async (req, res, next) => {
  const { description, category, amount, expenseDate, turnId } = req.body;

  if (!description || description.trim() === '' || !category || !amount || !expenseDate) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  if (!turnId) {
    return res.status(400).json({ success: false, message: 'Debe seleccionar una opción de origen de pago.' });
  }

  const deductFromCashier = turnId !== 'none';

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, message: 'El monto debe ser un número válido mayor a cero.' });
  }

  const allowedCategories = ['services', 'supplies', 'maintenance', 'other'];
  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ success: false, message: 'Categoría de gasto no válida.' });
  }

  const transaction = await sequelize.transaction();

  try {
    let selectedTurn = null;
    let cajaLabel = 'Pago externo (sin caja)';

    if (deductFromCashier) {
      // Validate the selected turn exists, is open, and belongs to the user's branch
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

      // Validate balance is sufficient
      const currentBalance = await calculateTurnBalance(selectedTurn, transaction);
      if (currentBalance < parsedAmount) {
        await transaction.rollback();
        cajaLabel = `${selectedTurn.boxName} (${selectedTurn.user ? selectedTurn.user.fullName : ''})`;
        return res.status(400).json({
          success: false,
          message: `Saldo insuficiente en ${cajaLabel}. Saldo actual: $${currentBalance.toFixed(2)}, monto del gasto: $${parsedAmount.toFixed(2)}.`
        });
      }

      cajaLabel = `${selectedTurn.boxName} (${selectedTurn.user ? selectedTurn.user.fullName : ''})`;
    }

    let receiptPath = null;
    if (req.file) {
      receiptPath = `/uploads/${req.file.filename}`;
    }

    const expense = await Expense.create({
      branchId: req.user.branchId,
      description: description.trim(),
      category,
      amount: parsedAmount,
      receiptPath,
      expenseDate
    }, { transaction });

    // Categoría legible para la razón del movimiento
    const categoryLabels = {
      services: 'Servicios',
      supplies: 'Suministros',
      maintenance: 'Mantenimiento',
      other: 'Otros'
    };
    const categoryLabel = categoryLabels[category] || 'Otros';

    // Only create cashier withdrawal if deducting from a cash register
    if (deductFromCashier && selectedTurn) {
      await CashierMovement.create({
        turnId: selectedTurn.id,
        type: 'withdrawal',
        amount: parsedAmount,
        reason: `Gasto - ${categoryLabel}: ${description.trim()}`
      }, { transaction });
    }

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'expenses.created',
      details: {
        expenseId: expense.id,
        amount: parsedAmount,
        category,
        description: description.trim(),
        deductedFromTurnId: selectedTurn ? selectedTurn.id : null,
        deductedFromBox: cajaLabel,
        paymentSource: deductFromCashier ? 'cashier' : 'external'
      },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: `Gasto registrado correctamente y deducido de ${cajaLabel}.` });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  listExpenses,
  createExpense,
  getAvailableTurns
};
