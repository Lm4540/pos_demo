const express = require('express');
const router = express.Router();
const branchesController = require('./branches-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);
router.use(checkPermission('branches.manage'));

router.get('/', branchesController.listBranches);
router.post('/', branchesController.createBranch);
router.post('/:id/edit', branchesController.updateBranch);
router.delete('/:id', branchesController.deleteBranch);

module.exports = router;
