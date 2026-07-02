const express = require('express');
const router = express.Router();
const categoriesController = require('./categories-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);

// List categories
router.get('/', checkPermission('inventory.view_catalog'), categoriesController.listCategories);

// Create category
router.post('/', checkPermission('inventory.manage_catalog'), categoriesController.createCategory);

// Update category
router.post('/:id/edit', checkPermission('inventory.manage_catalog'), categoriesController.updateCategory);

// Delete category
router.delete('/:id', checkPermission('inventory.manage_catalog'), categoriesController.deleteCategory);

module.exports = router;
