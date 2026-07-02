const { CashierTurn, CashierMovement, Sale, CreditPayment, Client, sequelize } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const renderOpenTurn = async (req, res, next) => {
  try {
    const activeTurn = await CashierTurn.findOne({
      where: {
        userId: req.user.id,
        branchId: req.user.branchId,
        status: 'open'
      }
    });

    if (activeTurn) {
      return res.redirect('/cashier/details');
    }

    const lastClosedTurn = await CashierTurn.findOne({
      where: {
        branchId: req.user.branchId,
        boxName: 'Caja 1',
        status: 'closed'
      },
      order: [['closedAt', 'DESC']]
    });

    return res.render('pages/cashier/open', {
      title: 'Abrir Turno de Caja',
      suggestedAmount: lastClosedTurn ? parseFloat(lastClosedTurn.closingAmount) : 0.00,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const handleOpenTurn = async (req, res, next) => {
  const { openingAmount, boxName } = req.body;
  const selectedBox = boxName ? boxName.trim() : 'Caja 1';
  const { User } = require('../../core/models');
  const transaction = await sequelize.transaction();

  try {
    const existingActiveTurn = await CashierTurn.findOne({
      where: {
        userId: req.user.id,
        branchId: req.user.branchId,
        status: 'open'
      },
      transaction
    });

    if (existingActiveTurn) {
      await transaction.rollback();
      return res.redirect('/cashier/details');
    }

    // Check if the selected box already has an active turn
    const activeTurnOnBox = await CashierTurn.findOne({
      where: {
        branchId: req.user.branchId,
        boxName: selectedBox,
        status: 'open'
      },
      include: [{ model: User, as: 'user' }],
      transaction
    });

    if (activeTurnOnBox) {
      await transaction.rollback();
      const userName = activeTurnOnBox.user ? activeTurnOnBox.user.fullName : 'otro cajero';
      const lastClosedTurn = await CashierTurn.findOne({
        where: {
          branchId: req.user.branchId,
          boxName: selectedBox,
          status: 'closed'
        },
        order: [['closedAt', 'DESC']]
      });
      return res.render('pages/cashier/open', {
        title: 'Abrir Turno de Caja',
        suggestedAmount: lastClosedTurn ? parseFloat(lastClosedTurn.closingAmount) : 0.00,
        error: `La caja "${selectedBox}" ya está siendo utilizada por ${userName}.`
      });
    }

    const lastClosedTurn = await CashierTurn.findOne({
      where: {
        branchId: req.user.branchId,
        boxName: selectedBox,
        status: 'closed'
      },
      order: [['closedAt', 'DESC']],
      transaction
    });

    // Enforce that openingAmount must equal last turn's closingAmount if it exists
    let finalOpeningAmount = 0.00;
    if (lastClosedTurn) {
      finalOpeningAmount = parseFloat(lastClosedTurn.closingAmount);
    } else {
      // If it's the first time opening this register, default to 0.00
      finalOpeningAmount = 0.00;
    }

    const newTurn = await CashierTurn.create({
      branchId: req.user.branchId,
      userId: req.user.id,
      openingAmount: finalOpeningAmount,
      boxName: selectedBox,
      status: 'open',
      openedAt: new Date()
    }, { transaction });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'cashier.turn_opened',
      details: { openingAmount: finalOpeningAmount, boxName: selectedBox, turnId: newTurn.id },
      ipAddress: req.ip
    });

    await transaction.commit();
    return res.redirect('/cashier/details');
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const renderTurnDetails = async (req, res, next) => {
  try {
    const activeTurn = req.activeTurn;

    const movements = await CashierMovement.findAll({
      where: { turnId: activeTurn.id },
      order: [['createdAt', 'DESC']]
    });

    const sales = await Sale.findAll({
      where: { turnId: activeTurn.id },
      order: [['createdAt', 'DESC']]
    });

    const creditPayments = await CreditPayment.findAll({
      where: { turnId: activeTurn.id },
      include: [{ model: Client, as: 'client' }],
      order: [['createdAt', 'DESC']]
    });

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
    const totalCreditPayments = creditPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const expectedCash = parseFloat(activeTurn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;

    const cashSalesDisplay = sales.filter(s => s.paymentMethod === 'cash' || parseFloat(s.amountCash) > 0);

    return res.render('pages/cashier/details', {
      title: 'Control de Caja',
      turn: activeTurn,
      movements,
      cashSales: cashSalesDisplay,
      creditPayments,
      totalDeposits,
      totalWithdrawals,
      totalCashSales,
      totalCreditPayments,
      expectedCash,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const handleCreateMovement = async (req, res, next) => {
  const { type, amount, reason } = req.body;
  const activeTurn = req.activeTurn;

  const parsedAmount = parseFloat(amount);
  if (!type || !['deposit', 'withdrawal'].includes(type) || isNaN(parsedAmount) || parsedAmount <= 0 || !reason || reason.trim() === '') {
    try {
      const movements = await CashierMovement.findAll({ where: { turnId: activeTurn.id } });
      const sales = await Sale.findAll({ where: { turnId: activeTurn.id } });
      const creditPayments = await CreditPayment.findAll({ where: { turnId: activeTurn.id }, include: [{ model: Client, as: 'client' }] });
      
      const totalDeposits = movements.filter(m => m.type === 'deposit').reduce((sum, m) => sum + parseFloat(m.amount), 0);
      const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((sum, m) => sum + parseFloat(m.amount), 0);
      const totalCashSales = sales.reduce((sum, s) => {
        const cashAmt = parseFloat(s.amountCash);
        if (cashAmt === 0 && s.paymentMethod === 'cash') {
          return sum + parseFloat(s.totalAmount);
        }
        return sum + cashAmt;
      }, 0);
      const totalCreditPayments = creditPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);
      const expectedCash = parseFloat(activeTurn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;

      const cashSalesDisplay = sales.filter(s => s.paymentMethod === 'cash' || parseFloat(s.amountCash) > 0);

      return res.render('pages/cashier/details', {
        title: 'Control de Caja',
        turn: activeTurn,
        movements,
        cashSales: cashSalesDisplay,
        creditPayments,
        totalDeposits,
        totalWithdrawals,
        totalCashSales,
        totalCreditPayments,
        expectedCash,
        error: 'Todos los campos son obligatorios y el monto debe ser mayor que cero.'
      });
    } catch (err) {
      return next(err);
    }
  }

  const transaction = await sequelize.transaction();

  try {
    const movement = await CashierMovement.create({
      turnId: activeTurn.id,
      type,
      amount: parsedAmount,
      reason: reason.trim()
    }, { transaction });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: `cashier.movement_${type}`,
      details: { amount: parsedAmount, reason: reason.trim(), movementId: movement.id, turnId: activeTurn.id },
      ipAddress: req.ip
    });

    await transaction.commit();
    return res.redirect('/cashier/details');
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const handleCloseTurn = async (req, res, next) => {
  const { closingAmount } = req.body;
  const activeTurn = req.activeTurn;

  const parsedAmount = parseFloat(closingAmount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    try {
      const movements = await CashierMovement.findAll({ where: { turnId: activeTurn.id } });
      const sales = await Sale.findAll({ where: { turnId: activeTurn.id } });
      const creditPayments = await CreditPayment.findAll({ where: { turnId: activeTurn.id }, include: [{ model: Client, as: 'client' }] });
      
      const totalDeposits = movements.filter(m => m.type === 'deposit').reduce((sum, m) => sum + parseFloat(m.amount), 0);
      const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((sum, m) => sum + parseFloat(m.amount), 0);
      const totalCashSales = sales.reduce((sum, s) => {
        const cashAmt = parseFloat(s.amountCash);
        if (cashAmt === 0 && s.paymentMethod === 'cash') {
          return sum + parseFloat(s.totalAmount);
        }
        return sum + cashAmt;
      }, 0);
      const totalCreditPayments = creditPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);
      const expectedCash = parseFloat(activeTurn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;

      const cashSalesDisplay = sales.filter(s => s.paymentMethod === 'cash' || parseFloat(s.amountCash) > 0);

      return res.render('pages/cashier/details', {
        title: 'Control de Caja',
        turn: activeTurn,
        movements,
        cashSales: cashSalesDisplay,
        creditPayments,
        totalDeposits,
        totalWithdrawals,
        totalCashSales,
        totalCreditPayments,
        expectedCash,
        error: 'El monto de cierre ingresado no es válido.'
      });
    } catch (err) {
      return next(err);
    }
  }

  const transaction = await sequelize.transaction();

  try {
    const movements = await CashierMovement.findAll({ where: { turnId: activeTurn.id }, transaction });
    const sales = await Sale.findAll({ where: { turnId: activeTurn.id }, transaction });
    
    const totalDeposits = movements.filter(m => m.type === 'deposit').reduce((sum, m) => sum + parseFloat(m.amount), 0);
    const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((sum, m) => sum + parseFloat(m.amount), 0);
    const totalCashSales = sales.reduce((sum, s) => {
      const cashAmt = parseFloat(s.amountCash);
      if (cashAmt === 0 && s.paymentMethod === 'cash') {
        return sum + parseFloat(s.totalAmount);
      }
      return sum + cashAmt;
    }, 0);
    
    const expectedCash = parseFloat(activeTurn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;

    await activeTurn.update({
      closingAmount: expectedCash, // theoretical expected cash
      declaredAmount: parsedAmount, // physical cash count declared by cashier
      status: 'closed',
      closedAt: new Date()
    }, { transaction });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'cashier.turn_closed',
      details: { declaredAmount: parsedAmount, expectedAmount: expectedCash, turnId: activeTurn.id },
      ipAddress: req.ip
    });

    await transaction.commit();
    return res.redirect('/dashboard');
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const handleForceClose = async (req, res, next) => {
  const { id } = req.params;
  const { closingAmount } = req.body;
  const transaction = await sequelize.transaction();

  try {
    const turn = await CashierTurn.findByPk(id, { transaction });
    if (!turn) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Turno no encontrado.' });
    }

    if (turn.status === 'closed') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'El turno ya se encuentra cerrado.' });
    }

    const parsedAmount = parseFloat(closingAmount) || 0.00;

    // Calculate expected cash dynamically
    const movements = await CashierMovement.findAll({ where: { turnId: turn.id }, transaction });
    const sales = await Sale.findAll({ where: { turnId: turn.id }, transaction });
    
    const totalDeposits = movements.filter(m => m.type === 'deposit').reduce((sum, m) => sum + parseFloat(m.amount), 0);
    const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((sum, m) => sum + parseFloat(m.amount), 0);
    const totalCashSales = sales.reduce((sum, s) => {
      const cashAmt = parseFloat(s.amountCash);
      if (cashAmt === 0 && s.paymentMethod === 'cash') {
        return sum + parseFloat(s.totalAmount);
      }
      return sum + cashAmt;
    }, 0);
    
    const expectedCash = parseFloat(turn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;

    await turn.update({
      closingAmount: expectedCash, // Theoretical expected cash
      declaredAmount: parsedAmount, // Supervisor physical check input
      status: 'closed',
      closedAt: new Date()
    }, { transaction });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'cashier.turn_force_closed',
      details: { declaredAmount: parsedAmount, expectedAmount: expectedCash, turnId: turn.id, cashierId: turn.userId },
      ipAddress: req.ip
    });

    await transaction.commit();
    return res.json({ success: true, message: 'Turno cerrado forzosamente.' });
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const renderHistory = async (req, res, next) => {
  try {
    const { User, Branch } = require('../../core/models');
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    const turns = await CashierTurn.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user' },
        { model: Branch, as: 'branch' }
      ],
      order: [['openedAt', 'DESC']]
    });

    return res.render('pages/cashier/history', {
      title: 'Historial de Cortes y Arqueos',
      turns
    });
  } catch (error) {
    return next(error);
  }
};

const renderHistoryDetail = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { User, Branch } = require('../../core/models');
    const turn = await CashierTurn.findByPk(id, {
      include: [
        { model: User, as: 'user' },
        { model: Branch, as: 'branch' }
      ]
    });

    if (!turn) {
      return res.status(404).render('pages/error', {
        title: 'Error',
        message: 'Turno no encontrado.',
        user: req.user
      });
    }

    if (req.user.roleId !== 'admin' && turn.branchId !== req.user.branchId) {
      return res.status(403).render('pages/error', {
        title: 'Acceso Denegado',
        message: 'No tienes permiso para ver cortes de caja de otras sucursales.',
        user: req.user
      });
    }

    const movements = await CashierMovement.findAll({
      where: { turnId: turn.id },
      order: [['createdAt', 'DESC']]
    });

    const sales = await Sale.findAll({
      where: { turnId: turn.id },
      order: [['createdAt', 'DESC']]
    });

    const creditPayments = await CreditPayment.findAll({
      where: { turnId: turn.id },
      include: [{ model: Client, as: 'client' }],
      order: [['createdAt', 'DESC']]
    });

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
    const totalCreditPayments = creditPayments.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);

    const expectedCash = parseFloat(turn.openingAmount) + totalDeposits - totalWithdrawals + totalCashSales;
    
    // Difference is declared amount (real cash count) minus theoretical expected cash
    const difference = turn.declaredAmount !== null ? parseFloat(turn.declaredAmount) - expectedCash : 0;

    const cashSalesDisplay = sales.filter(s => s.paymentMethod === 'cash' || parseFloat(s.amountCash) > 0);

    return res.render('pages/cashier/history-detail', {
      title: `Arqueo de Caja - Turno #${turn.id}`,
      turn,
      movements,
      cashSales: cashSalesDisplay,
      creditPayments,
      totalDeposits,
      totalWithdrawals,
      totalCashSales,
      totalCreditPayments,
      expectedCash,
      difference
    });
  } catch (error) {
    return next(error);
  }
};

const getBoxLastBalance = async (req, res, next) => {
  const { boxName } = req.query;
  try {
    const lastClosedTurn = await CashierTurn.findOne({
      where: {
        branchId: req.user.branchId,
        boxName: boxName || 'Caja 1',
        status: 'closed'
      },
      order: [['closedAt', 'DESC']]
    });
    const balance = lastClosedTurn ? parseFloat(lastClosedTurn.closingAmount) : 0.00;
    return res.json({ success: true, balance });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  renderOpenTurn,
  handleOpenTurn,
  renderTurnDetails,
  handleCreateMovement,
  handleCloseTurn,
  handleForceClose,
  renderHistory,
  renderHistoryDetail,
  getBoxLastBalance
};
