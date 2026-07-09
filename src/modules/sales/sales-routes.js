const express = require('express');
const router = express.Router();
const salesController = require('./sales-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const checkActiveTurn = require('../../core/middlewares/checkActiveTurn');

router.use(authMiddleware);

// POS UI (standard)
router.get('/pos', checkActiveTurn, salesController.renderPOS);

// POS Touch UI
router.get('/pos-touch', checkActiveTurn, salesController.renderPOSTouch);

// Customer display (no auth needed - public view)
router.get('/customer-display', salesController.renderCustomerDisplay);

// Product autocomplete/search
router.get('/api/products', salesController.searchProducts);

// Process sale
router.post('/', checkActiveTurn, salesController.createSale);

// Sale detail API
router.get('/api/:id', salesController.renderSaleDetail);

// Sales ticket log history
router.get('/history', checkPermission('reports.ticket_history'), salesController.renderHistory);

// Sale detail page (full HTML view)
router.get('/:id', salesController.renderSaleDetailPage);

// Void sale
router.delete('/:id', checkPermission('pos.void_sale'), salesController.voidSale);

module.exports = router;
