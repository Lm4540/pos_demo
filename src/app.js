const express = require('express');
const session = require('express-session');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { sequelize } = require('./core/models');
const { sessionConfig } = require('./config/session');
const { seedInitialData } = require('./core/utils/dbInit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar motor de vistas (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares globales
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));

// Sesiones con MySQL
app.use(session(sessionConfig));

// Middleware de autenticación global (Simulado temporalmente)
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.formatMoney = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '$0.00';
    return '$' + num.toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  next();
});

// Ruta pública para recibir y registrar logs del cliente (JS del navegador)
app.post('/log-error', async (req, res) => {
  try {
    const { ErrorLog } = require('./core/models');
    await ErrorLog.create({
      userId: req.session?.userId || null,
      branchId: req.session?.user?.branchId || null,
      route: req.body.route || 'unknown',
      method: req.body.method || 'CLIENT',
      errorMessage: req.body.message || 'Client-side error',
      errorStack: req.body.stack || '',
      payload: req.body.payload || {}
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Failed to log client-side error:', err);
    return res.status(500).json({ success: false });
  }
});

// Importar rutas
const authRoutes = require('./modules/auth/auth-routes');
const branchesRoutes = require('./modules/branches/branches-routes');
const usersRoutes = require('./modules/users/users-routes');
const suppliersRoutes = require('./modules/purchases/suppliers-routes');
const clientsRoutes = require('./modules/cxc/clients-routes');
const productsRoutes = require('./modules/inventory/products-routes');
const purchasesRoutes = require('./modules/purchases/purchases-routes');
const cashierRoutes = require('./modules/cashier/cashier-routes');
const salesRoutes = require('./modules/sales/sales-routes');
const expensesRoutes = require('./modules/expenses/expenses-routes');
const reportsRoutes = require('./modules/reports/reports-routes');
const transfersRoutes = require('./modules/inventory/transfers-routes');
const inventoryRoutes = require('./modules/inventory/inventory-routes');
const categoriesRoutes = require('./modules/inventory/categories-routes');
const promotionsRoutes = require('./modules/sales/promotions-routes');
const authMiddleware = require('./core/middlewares/authMiddleware');

// Registrar rutas
app.use('/auth', authRoutes);
app.use('/branches', branchesRoutes);
app.use('/users', usersRoutes);
app.use('/suppliers', suppliersRoutes);
app.use('/clients', clientsRoutes);
app.use('/products', productsRoutes);
app.use('/purchases', purchasesRoutes);
app.use('/cashier', cashierRoutes);
app.use('/sales', salesRoutes);
app.use('/expenses', expensesRoutes);
app.use('/reports', reportsRoutes);
app.use('/transfers', transfersRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/categories', categoriesRoutes);
app.use('/promotions', promotionsRoutes);

app.get('/help', authMiddleware, (req, res) => {
  return res.render('pages/help', {
    title: 'Manual de Ayuda',
    user: req.user
  });
});

app.get('/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const branchId = req.user.branchId;
    const { Op } = require('sequelize');
    const { BranchProduct, Product, ProductBatch, WebAuthnCredential } = require('./core/models');

    // 1. Critical stock alerts
    const criticalStockProducts = await BranchProduct.findAll({
      where: {
        branchId,
        minStock: { [Op.gt]: 0 },
        [Op.and]: sequelize.where(
          sequelize.col('totalStock'),
          '<=',
          sequelize.col('minStock')
        )
      },
      include: [{ model: Product, as: 'product' }]
    });

    // 2. Near-expiration batches (within 30 days)
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const expiringBatches = await ProductBatch.findAll({
      where: {
        branchId,
        currentQuantity: { [Op.gt]: 0 },
        expirationDate: {
          [Op.ne]: null,
          [Op.lte]: thirtyDaysFromNow
        }
      },
      include: [{ model: Product, as: 'product' }],
      order: [['expirationDate', 'ASC']]
    });

    const hasBiometrics = await WebAuthnCredential.count({ where: { userId: req.user.id } }) > 0;

    res.render('pages/dashboard', {
      title: 'Panel de Control',
      user: req.user,
      criticalStockProducts,
      expiringBatches,
      hasBiometrics
    });
  } catch (error) {
    return next(error);
  }
});

// --- RUTA DE MI PERFIL ---
app.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const { User, WebAuthnCredential, Branch } = require('./core/models');
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Branch, as: 'branch' }]
    });
    const credentials = await WebAuthnCredential.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.render('pages/profile', {
      title: 'Mi Perfil',
      user,
      credentials
    });
  } catch (error) {
    next(error);
  }
});

app.post('/profile/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Datos de contraseña inválidos (mínimo 6 caracteres).' });
    }

    const { User } = require('./core/models');
    const user = await User.findByPk(req.user.id);
    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'La contraseña actual es incorrecta.' });
    }

    user.passwordHash = newPassword;
    await user.save();

    const { logAction } = require('./core/services/auditService');
    await logAction({
      userId: user.id,
      branchId: user.branchId,
      action: 'users.password_changed',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    next(error);
  }
});

app.delete('/profile/credential/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { WebAuthnCredential } = require('./core/models');
    const credential = await WebAuthnCredential.findOne({
      where: { id, userId: req.user.id }
    });

    if (!credential) {
      return res.status(404).json({ success: false, message: 'Dispositivo biométrico no encontrado.' });
    }

    await credential.destroy();

    const { logAction } = require('./core/services/auditService');
    await logAction({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'auth.webauthn_revoked',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Dispositivo biométrico revocado correctamente.' });
  } catch (error) {
    next(error);
  }
});

// Rutas básicas (Placeholder)
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/auth/login');
});

// Manejador global de errores
app.use(async (err, req, res, next) => {
  console.error(err.stack);
  
  let errorLogId = null;
  try {
    const { ErrorLog } = require('./core/models');
    const logEntry = await ErrorLog.create({
      userId: req.session?.userId || null,
      branchId: req.session?.user?.branchId || null,
      route: req.originalUrl,
      method: req.method,
      errorMessage: err.message || 'Unknown Server Error',
      errorStack: err.stack || '',
      payload: {
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers
      }
    });
    errorLogId = logEntry.id;
  } catch (logErr) {
    console.error('Failed to save server error log to database:', logErr);
  }

  const isHtml = req.accepts('html') && !req.xhr;
  if (isHtml) {
    res.status(500).render('pages/error', {
      title: 'Error Interno del Servidor',
      message: err.message,
      errorLogId: errorLogId,
      error: err,
      route: req.originalUrl,
      method: req.method,
      payload: {
        body: req.body,
        query: req.query
      }
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Ha ocurrido un error interno en el servidor.',
      error: err.message,
      errorLogId: errorLogId
    });
  }
});

// Conectar base de datos y arrancar el servidor
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a la base de datos establecida exitosamente.');
    
    // Sembrar administrador inicial y sucursal si están vacíos
    await seedInitialData();
    
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT} en modo ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('No se pudo conectar a la base de datos:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
