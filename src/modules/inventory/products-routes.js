const express = require('express');
const router = express.Router();
const productsController = require('./products-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const upload = require('../../core/middlewares/upload');

// Catalog listing (Any authenticated user can view)
router.get('/', authMiddleware, checkPermission('inventory.view'), productsController.listProducts);

// APIs for product search and quick-create (e.g. from purchases screen)
router.get('/api/search', authMiddleware, checkPermission('inventory.view'), productsController.searchProductsApi);
router.post('/api/quick-create', authMiddleware, checkPermission('purchases.create'), upload.single('image'), productsController.createProduct);

// Catalog modifications (Admin only)
router.post('/batch-create', authMiddleware, checkPermission('admin'), productsController.batchCreateProducts);
router.post('/', authMiddleware, checkPermission('admin'), upload.single('image'), productsController.createProduct);
router.post('/:id/edit', authMiddleware, checkPermission('admin'), upload.single('image'), productsController.updateProduct);
router.delete('/:id', authMiddleware, checkPermission('admin'), productsController.deleteProduct);

// Inventory adjustments (Admin / Supervisor)
router.get('/:id/batches', authMiddleware, checkPermission('inventory.view'), productsController.listBatches);
router.post('/:id/adjust', authMiddleware, checkPermission('inventory.adjust'), productsController.adjustInventory);
router.get('/:id/kardex', authMiddleware, checkPermission('inventory.view'), productsController.renderKardex);
router.get('/:id/service-movements', authMiddleware, checkPermission('inventory.view'), productsController.renderServiceMovements);
router.post('/:id/branch-settings', authMiddleware, checkPermission('inventory.adjust'), productsController.updateBranchSettings);

module.exports = router;
