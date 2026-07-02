const { Client, Branch, Sale } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');

const listClients = async (req, res, next) => {
  try {
    // Admins see all clients; Supervisors and Cashiers see only their branch's clients
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    const clients = await Client.findAll({
      where: whereClause,
      include: [{ model: Branch, as: 'branch' }],
      order: [['name', 'ASC']]
    });

    const clientsWithAlerts = await Promise.all(clients.map(async (client) => {
      const plainClient = client.get({ plain: true });
      plainClient.isOverdue = false;
      plainClient.overdueDays = 0;
      plainClient.oldestUnpaidDate = null;

      if (parseFloat(client.currentBalance) > 0) {
        // Fetch credit sales for this client
        const creditSales = await Sale.findAll({
          where: { clientId: client.id, paymentMethod: 'credit' },
          order: [['createdAt', 'ASC']]
        });

        // Find oldest unpaid sale using open-balance FIFO logic
        const sortedSales = [...creditSales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        let remainingBalance = parseFloat(client.currentBalance);
        let oldestUnpaid = null;
        let runningSum = 0;
        
        for (const sale of sortedSales) {
          runningSum += parseFloat(sale.totalAmount);
          oldestUnpaid = sale;
          if (runningSum >= remainingBalance) {
            break;
          }
        }

        if (oldestUnpaid) {
          plainClient.oldestUnpaidDate = oldestUnpaid.createdAt;
          const oldestDate = new Date(oldestUnpaid.createdAt);
          const ageInMs = new Date() - oldestDate;
          const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
          
          plainClient.overdueDays = ageInDays;
          if (ageInDays > client.creditDays) {
            plainClient.isOverdue = true;
          }
        }
      }
      return plainClient;
    }));

    const branches = await Branch.findAll({ order: [['name', 'ASC']] });

    return res.render('pages/clients/index', {
      title: 'Clientes (CxC)',
      clients: clientsWithAlerts,
      branches,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const createClient = async (req, res, next) => {
  const { name, phone, branchId, creditLimit, creditDays, dui } = req.body;
  try {
    if (!name || name.trim() === '') {
      const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
      const clients = await Client.findAll({ where: whereClause, include: [{ model: Branch, as: 'branch' }] });
      const branches = await Branch.findAll();
      return res.render('pages/clients/index', {
        title: 'Clientes (CxC)',
        clients,
        branches,
        error: 'El nombre del cliente es obligatorio.'
      });
    }

    // Determine branch (restricted to user's branch for non-admins)
    const clientBranchId = req.user.roleId === 'admin' ? (parseInt(branchId, 10) || req.user.branchId) : req.user.branchId;

    if (!clientBranchId) {
      const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
      const clients = await Client.findAll({ where: whereClause, include: [{ model: Branch, as: 'branch' }] });
      const branches = await Branch.findAll();
      return res.render('pages/clients/index', {
        title: 'Clientes (CxC)',
        clients,
        branches,
        error: 'Debe especificar una sucursal para el cliente.'
      });
    }

    // Limit credit approvals to Admins only
    let assignedCreditLimit = 0.00;
    let assignedCreditDays = 30;
    if (req.user.roleId === 'admin') {
      assignedCreditLimit = parseFloat(creditLimit) || 0.00;
      assignedCreditDays = parseInt(creditDays, 10) || 30;
    }

    const client = await Client.create({
      name,
      phone,
      dui: dui && dui.trim() !== '' ? dui.trim() : null,
      branchId: clientBranchId,
      creditLimit: assignedCreditLimit,
      creditDays: assignedCreditDays,
      currentBalance: 0.00
    });

    await logAction({
      userId: req.user.id,
      branchId: clientBranchId,
      action: 'clients.created',
      details: { name, phone, creditLimit: assignedCreditLimit, creditDays: assignedCreditDays, dui },
      ipAddress: req.ip
    });

    return res.redirect('/clients?success=1');
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
      const clients = await Client.findAll({ where: whereClause, include: [{ model: Branch, as: 'branch' }] });
      const branches = await Branch.findAll();
      return res.render('pages/clients/index', {
        title: 'Clientes (CxC)',
        clients,
        branches,
        error: 'El número de DUI ya se encuentra registrado para otro cliente.'
      });
    }
    return next(error);
  }
};

const updateClient = async (req, res, next) => {
  const { id } = req.params;
  const { name, phone, branchId, creditLimit, creditDays, dui } = req.body;
  try {
    const client = await Client.findByPk(id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
    }

    // Enforce branch limits on non-admins
    if (req.user.roleId !== 'admin' && client.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso de modificar clientes de otras sucursales.' });
    }

    const clientBranchId = req.user.roleId === 'admin' ? (parseInt(branchId, 10) || client.branchId) : client.branchId;

    const updatePayload = {
      name,
      phone,
      dui: dui && dui.trim() !== '' ? dui.trim() : null,
      branchId: clientBranchId
    };

    // Credit limits can only be updated by Admin
    if (req.user.roleId === 'admin') {
      updatePayload.creditLimit = parseFloat(creditLimit) || 0.00;
      updatePayload.creditDays = parseInt(creditDays, 10) || 30;
    }

    await client.update(updatePayload);

    await logAction({
      userId: req.user.id,
      branchId: clientBranchId,
      action: 'clients.updated',
      details: { name, phone, creditLimit: updatePayload.creditLimit, creditDays: updatePayload.creditDays, dui },
      ipAddress: req.ip
    });

    return res.redirect('/clients?success=1');
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
      const clients = await Client.findAll({ where: whereClause, include: [{ model: Branch, as: 'branch' }] });
      const branches = await Branch.findAll();
      return res.render('pages/clients/index', {
        title: 'Clientes (CxC)',
        clients,
        branches,
        error: 'El número de DUI ya se encuentra registrado para otro cliente.'
      });
    }
    return next(error);
  }
};

const deleteClient = async (req, res, next) => {
  const { id } = req.params;
  try {
    const client = await Client.findByPk(id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Cliente no encontrado.' });
    }

    // Enforce branch limits on non-admins
    if (req.user.roleId !== 'admin' && client.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, message: 'No tienes permiso de eliminar clientes de otras sucursales.' });
    }

    // Cannot delete if they have pending debt balance
    if (parseFloat(client.currentBalance) > 0) {
      return res.status(400).json({ success: false, message: 'No se puede eliminar un cliente que tiene saldo pendiente de cobro ($' + client.currentBalance + ').' });
    }

    await client.destroy();

    await logAction({
      userId: req.user.id,
      branchId: client.branchId,
      action: 'clients.deleted',
      details: { name: client.name },
      ipAddress: req.ip
    });

    return res.json({ success: true, message: 'Cliente eliminado correctamente.' });
  } catch (error) {
    return next(error);
  }
};

const getClientAlerts = async (client) => {
  const alerts = {
    isOverdue: false,
    overdueDays: 0,
    oldestUnpaidDate: null
  };

  if (parseFloat(client.currentBalance) > 0) {
    const creditSales = await Sale.findAll({
      where: { clientId: client.id, paymentMethod: 'credit' },
      order: [['createdAt', 'ASC']]
    });

    const sortedSales = [...creditSales].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    let remainingBalance = parseFloat(client.currentBalance);
    let oldestUnpaid = null;
    let runningSum = 0;
    
    for (const sale of sortedSales) {
      runningSum += parseFloat(sale.totalAmount);
      oldestUnpaid = sale;
      if (runningSum >= remainingBalance) {
        break;
      }
    }

    if (oldestUnpaid) {
      alerts.oldestUnpaidDate = oldestUnpaid.createdAt;
      const oldestDate = new Date(oldestUnpaid.createdAt);
      const ageInMs = new Date() - oldestDate;
      const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
      
      alerts.overdueDays = ageInDays;
      if (ageInDays > client.creditDays) {
        alerts.isOverdue = true;
      }
    }
  }
  return alerts;
};

const searchClientsApi = async (req, res, next) => {
  const { q } = req.query;
  try {
    const { Op } = require('sequelize');
    // Non-admins only search their branch's clients
    const whereClause = req.user.roleId === 'admin' ? {} : { branchId: req.user.branchId };
    
    if (q && q.trim() !== '') {
      const query = q.trim();
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${query}%` } },
        { dui: { [Op.like]: `%${query}%` } }
      ];
    }

    const clients = await Client.findAll({
      where: whereClause,
      limit: 15,
      order: [['name', 'ASC']]
    });

    const formattedClients = await Promise.all(clients.map(async (c) => {
      const alerts = await getClientAlerts(c);
      return {
        id: c.id,
        name: c.name,
        dui: c.dui || '',
        phone: c.phone || '',
        creditLimit: parseFloat(c.creditLimit),
        currentBalance: parseFloat(c.currentBalance),
        creditDays: c.creditDays,
        isOverdue: alerts.isOverdue,
        overdueDays: alerts.overdueDays
      };
    }));

    return res.json({ success: true, clients: formattedClients });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const quickCreateClientApi = async (req, res, next) => {
  const { name, dui, phone } = req.body;
  try {
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre del cliente es obligatorio.' });
    }

    const client = await Client.create({
      name: name.trim(),
      dui: dui && dui.trim() !== '' ? dui.trim() : null,
      phone: phone && phone.trim() !== '' ? phone.trim() : null,
      branchId: req.user.branchId,
      creditLimit: 0.00,
      creditDays: 30,
      currentBalance: 0.00
    });

    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'clients.created',
      details: { name: client.name, dui: client.dui, quick: true },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: 'Cliente registrado correctamente.',
      client: {
        id: client.id,
        name: client.name,
        dui: client.dui || '',
        phone: client.phone || '',
        creditLimit: parseFloat(client.creditLimit),
        currentBalance: parseFloat(client.currentBalance),
        creditDays: client.creditDays,
        isOverdue: false,
        overdueDays: 0
      }
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'El número de DUI ya se encuentra registrado para otro cliente.' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  searchClientsApi,
  quickCreateClientApi
};
