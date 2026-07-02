const express = require('express');
const router = express.Router();
const clientsController = require('./clients-controller');
const cxcController = require('./cxc-controller');
const authMiddleware = require('../../core/middlewares/authMiddleware');
const checkPermission = require('../../core/middlewares/checkPermission');
const checkActiveTurn = require('../../core/middlewares/checkActiveTurn');

router.use(authMiddleware);

// Client management APIs (for POS quick-search and quick-create)
router.get('/api/search', clientsController.searchClientsApi);
router.post('/api/quick-create', clientsController.quickCreateClientApi);

// Client management
router.get('/', checkPermission('cxc.create_client'), clientsController.listClients);
router.post('/', checkPermission('cxc.create_client'), clientsController.createClient);
router.post('/:id/edit', checkPermission('cxc.create_client'), clientsController.updateClient);
router.delete('/:id', checkPermission('cxc.create_client'), clientsController.deleteClient);

// CxC (Accounts Receivable) operations
router.get('/:id/statement', checkPermission('reports.ticket_history'), cxcController.renderStatement);
router.post('/:id/payment', checkActiveTurn, checkPermission('cxc.add_payment'), cxcController.registerPayment);

module.exports = router;
