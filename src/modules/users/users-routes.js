const express = require('express');
const router = express.Router();
const usersController = require('./users-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware);
router.use(checkPermission('users.manage'));

router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.post('/role-permissions', usersController.updateRolePermissions);
router.get('/audit', usersController.viewAuditLogs);
router.post('/:id/edit', usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

module.exports = router;
