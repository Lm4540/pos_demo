const express = require('express');
const router = express.Router();
const salesController = require('./sales-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const checkActiveTurn = require('../../core/middlewares/checkActiveTurn');

router.use(authMiddleware);

// POS UI
router.get('/pos', checkActiveTurn, salesController.renderPOS);

// Product autocomplete/search
router.get('/api/products', salesController.searchProducts);

// Process sale
router.post('/', checkActiveTurn, salesController.createSale);

// Sales ticket log history
router.get('/history', checkPermission('reports.ticket_history'), salesController.renderHistory);

// Void sale
router.delete('/:id', checkPermission('pos.void_sale'), salesController.voidSale);

module.exports = router;
