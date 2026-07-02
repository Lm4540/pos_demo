const express = require('express');
const router = express.Router();
const expensesController = require('./expenses-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const checkActiveTurn = require('../../core/middlewares/checkActiveTurn');
const upload = require('../../core/middlewares/upload');

// All expense routes require authentication
router.use(authMiddleware);

// Render expenses list
router.get('/', checkPermission('expenses.create'), expensesController.listExpenses);

// Create expense (requires active cashier turn since it withdrawals money from cashier)
router.post('/', checkActiveTurn, checkPermission('expenses.create'), upload.single('receipt'), expensesController.createExpense);

module.exports = router;
