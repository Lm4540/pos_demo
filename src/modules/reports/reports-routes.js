const express = require('express');
const router = express.Router();
const reportsController = require('./reports-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

// Require authentication for all report routes
router.use(authMiddleware);

// Render consolidated/branch reports dashboard
router.get('/', checkPermission('reports.local_dashboard'), reportsController.renderDashboard);
router.get('/stock', checkPermission('reports.local_dashboard'), reportsController.renderStockReport);
router.get('/purchases', checkPermission('reports.local_dashboard'), reportsController.renderPurchasesReport);

// Export consolidated/branch reports dashboard PDF
router.get('/pdf', checkPermission('reports.local_dashboard'), reportsController.exportFinancialReportPdf);

// Export client account statement PDF
router.get('/statement/:clientId/pdf', checkPermission('reports.ticket_history'), reportsController.exportStatementPdf);

module.exports = router;
