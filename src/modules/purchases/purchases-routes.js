const express = require('express');
const router = express.Router();
const purchasesController = require('./purchases-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);
router.use(checkPermission('purchases.create'));

router.get('/', purchasesController.listPurchases);
router.get('/new', purchasesController.renderNewPurchase);
router.post('/', purchasesController.createPurchase);
router.get('/payments', purchasesController.renderSupplierPayments);
router.post('/payments', purchasesController.paySupplier);
router.get('/:id', purchasesController.renderPurchaseDetail);

module.exports = router;
