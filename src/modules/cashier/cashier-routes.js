const express = require('express');
const router = express.Router();
const cashierController = require('./cashier-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const checkActiveTurn = require('../../core/middlewares/checkActiveTurn');

router.use(authMiddleware);

// Open cashier turn routes
router.get('/open', checkPermission('cashier.open_turn'), cashierController.renderOpenTurn);
router.post('/open', checkPermission('cashier.open_turn'), cashierController.handleOpenTurn);
router.get('/api/box-last-balance', cashierController.getBoxLastBalance);

// Active turn endpoints
router.get('/details', checkActiveTurn, cashierController.renderTurnDetails);
router.post('/movement', checkActiveTurn, checkPermission('cashier.movement'), cashierController.handleCreateMovement);
router.post('/close', checkActiveTurn, checkPermission('cashier.close_own_turn'), cashierController.handleCloseTurn);

// Cashier history / arqueos (Supervisors / Admins)
router.get('/history', checkPermission('reports.local_dashboard'), cashierController.renderHistory);
router.get('/history/:id', checkPermission('reports.local_dashboard'), cashierController.renderHistoryDetail);

// Force close other turns (Supervisors / Admins)
router.post('/force-close/:id', checkPermission('cashier.force_close_turn'), cashierController.handleForceClose);

// Reports X and Z endpoints
router.get('/api/report-x', checkActiveTurn, cashierController.getReportXData);
router.get('/api/report-z/:id', cashierController.getReportZData);

module.exports = router;
