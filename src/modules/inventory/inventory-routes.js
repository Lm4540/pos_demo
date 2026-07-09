const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);

// Auditorías Físicas
router.get('/audits', checkPermission('inventory.view'), inventoryController.renderAuditsIndex);
router.post('/audits', checkPermission('inventory.adjust'), inventoryController.handleCreateAudit);
router.get('/audits/api/products', checkPermission('inventory.view'), inventoryController.searchBranchProducts);
router.post('/audits/api/load-template', checkPermission('inventory.adjust'), inventoryController.loadAllBranchProducts);
router.post('/audits/api/save-draft', checkPermission('inventory.adjust'), inventoryController.handleSaveDraft);
router.post('/audits/api/finalize', checkPermission('inventory.adjust'), inventoryController.handleFinalizeAudit);
router.get('/audits/:id', checkPermission('inventory.adjust'), inventoryController.renderAuditCount);
router.get('/audits/:id/report', checkPermission('inventory.view'), inventoryController.renderAuditReport);

// Levantamiento Inicial de Inventario
const upload = require('../../core/middlewares/upload');
router.get('/initial-load', checkPermission('inventory.adjust'), inventoryController.renderInitialLoad);
router.post('/initial-load/product', checkPermission('inventory.adjust'), upload.single('image'), inventoryController.quickCreateProduct);
router.post('/initial-load/submit', checkPermission('inventory.adjust'), inventoryController.submitInitialLoad);

module.exports = router;
