const express = require('express');
const router = express.Router();
const promotionsController = require('./promotions-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);

// List promotions
router.get('/', checkPermission('sales.view_catalog'), promotionsController.listPromotions);

// Create promotion
router.post('/', checkPermission('sales.manage_catalog'), promotionsController.createPromotion);

// Update promotion
router.post('/:id/edit', checkPermission('sales.manage_catalog'), promotionsController.updatePromotion);

// Delete promotion
router.delete('/:id', checkPermission('sales.manage_catalog'), promotionsController.deletePromotion);

module.exports = router;
