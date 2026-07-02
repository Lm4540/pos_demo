const express = require('express');
const router = express.Router();
const suppliersController = require('./suppliers-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);
router.use(checkPermission('purchases.create'));

router.get('/', suppliersController.listSuppliers);
router.post('/', suppliersController.createSupplier);
router.post('/:id/edit', suppliersController.updateSupplier);
router.delete('/:id', suppliersController.deleteSupplier);

module.exports = router;
