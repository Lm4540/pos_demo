const express = require('express');
const router = express.Router();
const purchasesController = require('./purchases-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);
router.use(checkPermission('purchases.create'));

// List / Calendar of Purchase Orders
router.get('/orders', purchasesController.listOrders);
router.post('/orders', purchasesController.createOrder);
router.post('/orders/:id/update', purchasesController.updateOrder);
router.put('/orders/:id', purchasesController.updateOrder);
router.post('/orders/:id/delete', purchasesController.deleteOrder);
router.delete('/orders/:id', purchasesController.deleteOrder);
router.post('/orders/:id/toggle-status', purchasesController.toggleOrderStatus);
router.get('/orders/api/events', purchasesController.getOrderCalendarEvents);

// Purchases & Payments
router.get('/', purchasesController.listPurchases);
router.get('/api/available-turns', purchasesController.getAvailableTurns);
router.get('/new', purchasesController.renderNewPurchase);
router.post('/', purchasesController.createPurchase);
router.get('/payments', purchasesController.renderSupplierPayments);
router.post('/payments', purchasesController.paySupplier);
router.get('/:id', purchasesController.renderPurchaseDetail);

module.exports = router;
