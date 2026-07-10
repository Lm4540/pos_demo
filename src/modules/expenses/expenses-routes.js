const express = require('express');
const router = express.Router();
const expensesController = require('./expenses-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const upload = require('../../core/middlewares/upload');

// All expense routes require authentication
router.use(authMiddleware);

// Render expenses list
router.get('/', checkPermission('expenses.create'), expensesController.listExpenses);

// API: Get open cashier turns with available balance for expense deduction
router.get('/available-turns', checkPermission('expenses.create'), expensesController.getAvailableTurns);

// Create expense (no longer requires checkActiveTurn; user selects the turn)
router.post('/', checkPermission('expenses.create'), upload.single('receipt'), expensesController.createExpense);

module.exports = router;
