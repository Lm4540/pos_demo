const { Sale, SaleDetail, Purchase, Expense, Client, CreditPayment, Branch, Product, sequelize } = require('../../core/models');
const { logAction } = require('../../core/services/auditService');
const { generatePdf } = require('../../core/services/pdfService');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

const getReportData = async ({ startDate, endDate, branchId }, user) => {
  // Rango de fechas por defecto: últimos 30 días
  const today = new Date();
  const defaultEndDate = today.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const defaultStartDate = thirtyDaysAgo.toISOString().slice(0, 10);

  startDate = startDate || defaultStartDate;
  endDate = endDate || defaultEndDate;

  // Filtrado de sucursales según rol
  let filterBranchId = null;
  let branchName = 'Todas las Sucursales';

  if (user.roleId === 'admin') {
    if (branchId && branchId !== 'all') {
      filterBranchId = parseInt(branchId, 10);
      const br = await Branch.findByPk(filterBranchId);
      if (br) branchName = br.name;
    }
  } else {
    filterBranchId = user.branchId;
    const br = await Branch.findByPk(filterBranchId);
    if (br) branchName = br.name;
  }

  // Clausulas WHERE para las consultas
  const dateRangeClause = {
    createdAt: {
      [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
    }
  };

  const expenseDateRangeClause = {
    expenseDate: {
      [Op.between]: [startDate, endDate]
    }
  };

  const salesWhere = { ...dateRangeClause };
  const purchasesWhere = { ...dateRangeClause };
  const expensesWhere = { ...expenseDateRangeClause };

  if (filterBranchId) {
    salesWhere.branchId = filterBranchId;
    purchasesWhere.branchId = filterBranchId;
    expensesWhere.branchId = filterBranchId;
  }

  // 1. Consultar Ventas
  const sales = await Sale.findAll({
    where: salesWhere,
    order: [['createdAt', 'DESC']]
  });

  const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);
  const cashSales = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);
  const creditSales = sales.filter(s => s.paymentMethod === 'credit').reduce((sum, s) => sum + parseFloat(s.totalAmount), 0);

  // 2. Consultar Costo de Ventas (COGS)
  const saleDetails = await SaleDetail.findAll({
    include: [
      {
        model: Sale,
        as: 'sale',
        where: salesWhere
      }
    ]
  });

  const totalCogs = saleDetails.reduce((sum, d) => sum + (parseInt(d.quantity, 10) * parseFloat(d.unitCostAtSale)), 0);

  // 3. Consultar Compras
  const purchases = await Purchase.findAll({
    where: purchasesWhere,
    order: [['createdAt', 'DESC']]
  });

  const totalPurchases = purchases.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0);

  // 4. Consultar Gastos
  const expenses = await Expense.findAll({
    where: expensesWhere,
    order: [['expenseDate', 'DESC']]
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // 5. Utilidad Bruta
  const grossProfit = totalSales - totalCogs - totalExpenses;

  // 6. Consultas SQL puras (Regla de Rendimiento de Reportería)
  // 6.1. Productos más vendidos (Top Sellers) con Rentabilidad Real
  const topSellers = await sequelize.query(
    `SELECT p.name, p.barCode, 
            SUM(sd.quantity) as totalQty, 
            SUM(sd.quantity * sd.unitPrice) as totalRevenue,
            SUM(sd.quantity * sd.unitCostAtSale) as totalCost,
            SUM(sd.quantity * sd.unitPrice) - SUM(sd.quantity * sd.unitCostAtSale) as totalProfit,
            CASE 
              WHEN SUM(sd.quantity * sd.unitPrice) > 0 
              THEN ((SUM(sd.quantity * sd.unitPrice) - SUM(sd.quantity * sd.unitCostAtSale)) / SUM(sd.quantity * sd.unitPrice)) * 100 
              ELSE 0 
            END as margin
     FROM saledetails sd
     JOIN sales s ON sd.saleId = s.id
     JOIN products p ON sd.productId = p.id
     WHERE s.createdAt BETWEEN :startDate AND :endDate
       ${filterBranchId ? 'AND s.branchId = :filterBranchId' : ''}
     GROUP BY sd.productId, p.name, p.barCode
     ORDER BY totalProfit DESC
     LIMIT 10`,
    {
      replacements: { startDate: `${startDate}T00:00:00`, endDate: `${endDate}T23:59:59`, filterBranchId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  // 6.2. Tendencia de Ventas Diarias
  const dailyTrend = await sequelize.query(
    `SELECT DATE(s.createdAt) as dateStr, SUM(s.totalAmount) as total
     FROM sales s
     WHERE s.createdAt BETWEEN :startDate AND :endDate
       ${filterBranchId ? 'AND s.branchId = :filterBranchId' : ''}
     GROUP BY DATE(s.createdAt)
     ORDER BY dateStr ASC`,
    {
      replacements: { startDate: `${startDate}T00:00:00`, endDate: `${endDate}T23:59:59`, filterBranchId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  // 6.3. CxC - Cuentas por Cobrar
  const [cxcSummary] = await sequelize.query(
    `SELECT SUM(currentBalance) as totalCreditBalance
     FROM clients
     WHERE (:filterBranchId IS NULL OR branchId = :filterBranchId)`,
    {
      replacements: { filterBranchId: filterBranchId || null },
      type: sequelize.QueryTypes.SELECT
    }
  );
  const totalCreditBalance = parseFloat(cxcSummary?.totalCreditBalance) || 0.00;

  const clientsDebt = await sequelize.query(
    `SELECT c.id, c.name, c.phone, c.creditLimit, c.currentBalance, c.creditDays, b.name as branchName,
       (SELECT MIN(s.createdAt) FROM sales s WHERE s.clientId = c.id AND s.paymentMethod = 'credit') as oldestSaleDate
     FROM clients c
     JOIN branches b ON c.branchId = b.id
     WHERE c.currentBalance > 0
       ${filterBranchId ? 'AND c.branchId = :filterBranchId' : ''}
     ORDER BY c.currentBalance DESC`,
    {
      replacements: { filterBranchId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  let totalOverdue = 0.00;
  let totalVigente = 0.00;
  const clientsWithDebtAlerts = clientsDebt.map(c => {
    const oldestDateStr = c.oldestSaleDate;
    let isOverdue = false;
    let overdueDays = 0;
    
    if (oldestDateStr) {
      const oldestDate = new Date(oldestDateStr);
      const ageInDays = Math.floor((new Date() - oldestDate) / (1000 * 60 * 60 * 24));
      overdueDays = ageInDays;
      if (ageInDays > c.creditDays) {
        isOverdue = true;
        totalOverdue += parseFloat(c.currentBalance);
      } else {
        totalVigente += parseFloat(c.currentBalance);
      }
    } else {
      totalVigente += parseFloat(c.currentBalance);
    }

    return {
      ...c,
      isOverdue,
      overdueDays
    };
  });

  return {
    startDate,
    endDate,
    selectedBranchId: branchId || 'all',
    branchName,
    totalSales,
    cashSales,
    creditSales,
    totalCogs,
    totalPurchases,
    totalExpenses,
    grossProfit,
    salesCount: sales.length,
    purchasesCount: purchases.length,
    expensesCount: expenses.length,
    recentSales: sales.slice(0, 5),
    recentExpenses: expenses.slice(0, 5),
    topSellers,
    dailyTrend,
    totalCreditBalance,
    totalOverdue,
    totalVigente,
    clientsWithDebtAlerts
  };
};

const renderDashboard = async (req, res, next) => {
  try {
    const reportData = await getReportData(req.query, req.user);
    let branches = [];
    if (req.user.roleId === 'admin') {
      branches = await Branch.findAll({ order: [['name', 'ASC']] });
    }
    return res.render('pages/reports/dashboard', {
      title: 'Reporte Financiero',
      user: req.user,
      branches,
      ...reportData
    });
  } catch (error) {
    return next(error);
  }
};

const exportFinancialReportPdf = async (req, res, next) => {
  try {
    const reportData = await getReportData(req.query, req.user);
    const templatePath = path.join(__dirname, '../../views/pages/reports/pdf.ejs');

    ejs.renderFile(templatePath, {
      title: `Reporte Financiero - ${reportData.branchName}`,
      user: req.user,
      ...reportData,
      isPdf: true
    }, { filename: templatePath }, async (err, htmlContent) => {
      if (err) {
        console.error('Error al compilar plantilla de EJS para PDF:', err);
        return res.status(500).send('Error interno al generar el reporte.');
      }

      const tempDir = path.join(__dirname, '../../../storage/temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const pdfPath = path.join(tempDir, `ReporteFinanciero_${Date.now()}.pdf`);

      try {
        await generatePdf(htmlContent, pdfPath);
        
        res.download(pdfPath, `ReporteFinanciero_${reportData.branchName.replace(/\s+/g, '_')}_${reportData.startDate}_al_${reportData.endDate}.pdf`, (downloadErr) => {
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
          }
          if (downloadErr) {
            console.error('Error al descargar PDF:', downloadErr);
          }
        });
      } catch (pdfErr) {
        console.error('wkhtmltopdf no está disponible o falló:', pdfErr.message);
        const htmlWithPrintDirective = htmlContent.replace('</head>', '<script>window.onload = function() { window.print(); }</script></head>');
        return res.send(htmlWithPrintDirective);
      }
    });
  } catch (error) {
    return next(error);
  }
};

const exportStatementPdf = async (req, res, next) => {
  const { clientId } = req.params;
  try {
    const client = await Client.findByPk(clientId, {
      include: [{ model: Branch, as: 'branch' }]
    });

    if (!client) {
      return res.status(404).send('Cliente no encontrado.');
    }

    if (req.user.roleId !== 'admin' && client.branchId !== req.user.branchId) {
      return res.status(403).send('No tienes permisos para ver el estado de cuenta de este cliente.');
    }

    const creditSales = await Sale.findAll({
      where: { clientId: client.id, paymentMethod: 'credit' },
      order: [['createdAt', 'ASC']]
    });

    const creditPayments = await CreditPayment.findAll({
      where: { clientId: client.id },
      order: [['createdAt', 'ASC']]
    });

    const transactions = [];

    creditSales.forEach(s => {
      transactions.push({
        date: s.createdAt,
        type: 'charge',
        reference: s.ticketNumber,
        amount: parseFloat(s.totalAmount),
        description: 'Compra al Crédito'
      });
    });

    creditPayments.forEach(p => {
      transactions.push({
        date: p.createdAt,
        type: 'payment',
        reference: p.receiptNumber,
        amount: parseFloat(p.amountPaid),
        description: 'Abono Recibido'
      });
    });

    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    let cumulativeBalance = 0.00;
    transactions.forEach(t => {
      if (t.type === 'charge') {
        cumulativeBalance += t.amount;
      } else if (t.type === 'payment') {
        cumulativeBalance -= t.amount;
      }
      t.balance = cumulativeBalance;
    });

    // Renderizar HTML del estado de cuenta de forma aislada para el PDF
    // Usamos el layout del statement pero pasándole isPdf: true
    const templatePath = path.join(__dirname, '../../views/pages/cxc/statement.ejs');
    
    // Express res.render internally injects helpers. For ejs.renderFile, we need to pass some global options like settings/views if needed, or pass full paths.
    // To make path includes work in EJS, we specify the filename option so EJS knows the relative path.
    ejs.renderFile(templatePath, {
      title: `Estado de Cuenta - ${client.name}`,
      clientData: client,
      transactions,
      user: req.user,
      isPdf: true
    }, { filename: templatePath }, async (err, htmlContent) => {
      if (err) {
        console.error('Error al compilar plantilla de EJS para PDF:', err);
        return res.status(500).send('Error interno al generar el reporte.');
      }

      const tempDir = path.join(__dirname, '../../../storage/temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const pdfPath = path.join(tempDir, `EstadoCuenta_${client.id}_${Date.now()}.pdf`);

      try {
        await generatePdf(htmlContent, pdfPath);
        
        res.download(pdfPath, `EstadoCuenta_${client.name.replace(/\s+/g, '_')}.pdf`, (downloadErr) => {
          // Eliminar archivo temporal tras descarga
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
          }
          if (downloadErr) {
            console.error('Error al descargar PDF:', downloadErr);
          }
        });
      } catch (pdfErr) {
        console.error('wkhtmltopdf no está disponible o falló:', pdfErr.message);
        // Fallback: Si no está instalado wkhtmltopdf en el OS, devolvemos el HTML limpio para que el usuario imprima nativamente
        // con un aviso/banner
        const htmlWithPrintDirective = htmlContent.replace('</head>', '<script>window.onload = function() { window.print(); }</script></head>');
        return res.send(htmlWithPrintDirective);
      }
    });

  } catch (error) {
    return next(error);
  }
};

const renderStockReport = async (req, res, next) => {
  try {
    const { Product, BranchProduct, Branch } = require('../../core/models');
    
    // Fetch all products with their branch associations
    const products = await Product.findAll({
      include: [
        {
          model: BranchProduct,
          as: 'branchProducts',
          include: [{ model: Branch, as: 'branch' }]
        }
      ],
      order: [['name', 'ASC']]
    });

    const branches = await Branch.findAll({ order: [['name', 'ASC']] });

    // Calculate consolidated valuation metrics
    let totalGlobalItemsCount = 0;
    let totalGlobalStock = 0;
    let totalGlobalCostValuation = 0.00;
    let totalGlobalSaleValuation = 0.00;

    const consolidatedStock = products.map(p => {
      let totalStock = 0;
      let totalCostValue = 0.00;
      let totalSaleValue = 0.00;
      
      p.branchProducts.forEach(bp => {
        const qty = parseInt(bp.totalStock || 0, 10);
        const cost = parseFloat(bp.averageCost || 0);
        const price = parseFloat(bp.salePrice || 0);
        
        totalStock += qty;
        totalCostValue += qty * cost;
        totalSaleValue += qty * price;
      });

      totalGlobalStock += totalStock;
      totalGlobalCostValuation += totalCostValue;
      totalGlobalSaleValuation += totalSaleValue;
      if (totalStock > 0) {
        totalGlobalItemsCount++;
      }

      return {
        id: p.id,
        name: p.name,
        barCode: p.barCode,
        imagePath: p.imagePath,
        branchDetails: p.branchProducts,
        totalStock,
        averageCost: totalStock > 0 ? (totalCostValue / totalStock) : 0.00,
        totalCostValue,
        totalSaleValue
      };
    });

    // Sort consolidated stock first by items with stock (totalStock > 0), then by name
    consolidatedStock.sort((a, b) => {
      const hasStockA = a.totalStock > 0 ? 1 : 0;
      const hasStockB = b.totalStock > 0 ? 1 : 0;
      if (hasStockB !== hasStockA) {
        return hasStockB - hasStockA;
      }
      return a.name.localeCompare(b.name);
    });

    return res.render('pages/reports/stock', {
      title: 'Reporte Completo de Inventario',
      user: req.user,
      branches,
      consolidatedStock,
      totalGlobalItemsCount,
      totalGlobalStock,
      totalGlobalCostValuation,
      totalGlobalSaleValuation,
      error: null
    });
  } catch (error) {
    return next(error);
  }
};

const renderPurchasesReport = async (req, res, next) => {
  try {
    const { Purchase, Supplier, Branch, PurchaseDetail, SupplierPayment } = require('../../core/models');
    const { Op } = require('sequelize');
    
    // Default to current month
    const today = new Date();
    const defaultMonth = today.toISOString().slice(0, 7); // "YYYY-MM"
    const month = req.query.month || defaultMonth;
    
    const startOfMonth = new Date(`${month}-01T00:00:00`);
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59);

    // Filtering by branch
    let filterBranchId = null;
    let branchName = 'Todas las Sucursales';
    let branches = [];

    if (req.user.roleId === 'admin') {
      branches = await Branch.findAll({ order: [['name', 'ASC']] });
      if (req.query.branchId && req.query.branchId !== 'all') {
        filterBranchId = parseInt(req.query.branchId, 10);
        const br = await Branch.findByPk(filterBranchId);
        if (br) branchName = br.name;
      }
    } else {
      filterBranchId = req.user.branchId;
      const br = await Branch.findByPk(filterBranchId);
      if (br) branchName = br.name;
    }

    const whereClause = {
      createdAt: {
        [Op.between]: [startOfMonth, endOfMonth]
      }
    };

    if (filterBranchId) {
      whereClause.branchId = filterBranchId;
    }

    const purchases = await Purchase.findAll({
      where: whereClause,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: Branch, as: 'branch' },
        { model: PurchaseDetail, as: 'details' }
      ],
      order: [['createdAt', 'DESC']]
    });

    let totalAmount = 0;
    let totalPaid = 0;
    let totalPending = 0;
    const supplierSummaryMap = {};

    purchases.forEach(p => {
      const amount = parseFloat(p.totalAmount || 0);
      const paid = parseFloat(p.amountPaid || 0);
      const pending = amount - paid;
      
      totalAmount += amount;
      totalPaid += paid;
      totalPending += pending;

      if (p.supplier) {
        if (!supplierSummaryMap[p.supplier.id]) {
          supplierSummaryMap[p.supplier.id] = {
            name: p.supplier.name,
            count: 0,
            total: 0
          };
        }
        supplierSummaryMap[p.supplier.id].count += 1;
        supplierSummaryMap[p.supplier.id].total += amount;
      }
    });

    const supplierSummary = Object.values(supplierSummaryMap).sort((a, b) => b.total - a.total);

    return res.render('pages/reports/purchases', {
      title: 'Reporte de Compras del Mes',
      user: req.user,
      purchases,
      totalAmount,
      totalPaid,
      totalPending,
      supplierSummary,
      month,
      selectedBranchId: req.query.branchId || 'all',
      branchName,
      branches
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  renderDashboard,
  exportStatementPdf,
  exportFinancialReportPdf,
  renderStockReport,
  renderPurchasesReport
};
