const { Expense, CashierMovement, Branch } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { sequelize } = require('../../core/models');

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

    return res.render('pages/expenses/index', {
      title: 'Módulo de Gastos',
      expenses
    });
  } catch (error) {
    return next(error);
  }
};

const createExpense = async (req, res, next) => {
  const { description, category, amount, expenseDate } = req.body;
  const activeTurn = req.activeTurn;

  if (!description || description.trim() === '' || !category || !amount || !expenseDate) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

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

    await CashierMovement.create({
      turnId: activeTurn.id,
      type: 'withdrawal',
      amount: parsedAmount,
      reason: `Gasto - ${categoryLabel}: ${description.trim()}`
    }, { transaction });

    await transaction.commit();

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'expenses.created',
      details: { expenseId: expense.id, amount: parsedAmount, category, description: description.trim() },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Gasto registrado correctamente y deducido de caja.' });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  listExpenses,
  createExpense
};
