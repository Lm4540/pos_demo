const express = require('express');
const router = express.Router();
const transfersController = require('./transfers-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);

router.get('/', checkPermission('inventory.view'), transfersController.listTransfers);
router.get('/new', checkPermission('inventory.adjust'), transfersController.renderNewTransfer);
router.post('/', checkPermission('inventory.adjust'), transfersController.createTransfer);
router.get('/:id', checkPermission('inventory.view'), transfersController.viewTransfer);
router.get('/:id/receive', checkPermission('inventory.adjust'), transfersController.renderReceiveTransfer);
router.post('/:id/receive', checkPermission('inventory.adjust'), transfersController.receiveTransfer);
router.post('/:id/cancel', checkPermission('inventory.adjust'), transfersController.cancelTransfer);

module.exports = router;
