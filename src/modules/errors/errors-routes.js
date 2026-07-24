const express = require('express');
const router = express.Router();
const errorsController = require('./errors-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');

router.use(authMiddleware, checkPermission('admin'));

router.get('/', errorsController.listErrors);
router.get('/api/:id', errorsController.getErrorDetailApi);
router.delete('/:id', errorsController.deleteError);
router.post('/clear-all', errorsController.clearAllErrors);

module.exports = router;
