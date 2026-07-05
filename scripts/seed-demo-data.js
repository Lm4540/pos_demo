/**
 * seed-demo-data.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Seed script that populates the POS database with demo data inspired by
 * products from Súper Selectos (superselectos.com).
 *
 * Creates:
 *   • Categories (12)
 *   • Suppliers (5)
 *   • Products (~50, with barcodes & images)
 *   • Purchase transactions → ingresses stock into BranchProduct & ProductBatch
 *   • Kardex entries for every purchase
 *   • CashierTurns for every day of the past month
 *   • Sale transactions spread over the last 30 days with SaleDetails
 *   • Kardex entries for every sale
 *
 * Usage:
 *   node scripts/seed-demo-data.js
 * ──────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const {
  sequelize,
  Branch,
  User,
  Category,
  Product,
  BranchProduct,
  ProductBatch,
  Supplier,
  Purchase,
  PurchaseDetail,
  CashierTurn,
  Sale,
  SaleDetail,
  Kardex
} = require('../src/core/models');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, dec = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec));
}

function generateBarcode(index) {
  return `74${String(index).padStart(11, '0')}`;
}

function generateBatchCode(purchaseNum, lineNum) {
  return `LOT-${String(purchaseNum).padStart(4, '0')}-${String(lineNum).padStart(2, '0')}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Frutas y Verduras', description: 'Productos frescos, frutas y verduras' },
  { name: 'Carnes y Embutidos', description: 'Carnes rojas, pollo, embutidos y mariscos' },
  { name: 'Lácteos y Huevos', description: 'Leche, quesos, yogurt y huevos' },
  { name: 'Panadería y Tortillas', description: 'Pan, tortillas y repostería' },
  { name: 'Abarrotes', description: 'Granos, pastas, salsas, condimentos y conservas' },
  { name: 'Bebidas', description: 'Jugos, gaseosas, agua y bebidas energéticas' },
  { name: 'Snacks y Confitería', description: 'Chocolates, galletas, boquitas y dulces' },
  { name: 'Cuidado Personal', description: 'Shampoo, jabón, desodorantes y cuidado bucal' },
  { name: 'Cuidado del Hogar', description: 'Detergentes, desinfectantes y limpieza' },
  { name: 'Cuidado del Bebé', description: 'Pañales, fórmulas y alimentos para bebé' },
  { name: 'Mascotas', description: 'Alimento y accesorios para mascotas' },
  { name: 'Cervezas y Licores', description: 'Cervezas, vinos y licores' }
];

const SUPPLIERS = [
  { name: 'Distribuidora Centroamericana S.A.', phone: '2267-6767', address: 'San Salvador, El Salvador' },
  { name: 'Nestlé El Salvador', phone: '2260-1000', address: 'Antiguo Cuscatlán, La Libertad' },
  { name: 'Unilever de C.A. S.A.', phone: '2248-5000', address: 'Santa Tecla, La Libertad' },
  { name: 'La Constancia (AB InBev)', phone: '2231-5000', address: 'San Salvador, El Salvador' },
  { name: 'Diana Foods El Salvador', phone: '2213-2000', address: 'Soyapango, San Salvador' }
];

// Products inspired by Súper Selectos catalog — names, prices, and categories
const PRODUCTS = [
  // ── Frutas y Verduras (cat 1) ──
  { name: 'Banano Criollo por Libra', cost: 0.20, price: 0.35, catIdx: 0 },
  { name: 'Tomate de Cocina por Libra', cost: 0.30, price: 0.55, catIdx: 0 },
  { name: 'Cebolla Blanca por Libra', cost: 0.25, price: 0.45, catIdx: 0 },
  { name: 'Papa Blanca por Libra', cost: 0.35, price: 0.65, catIdx: 0 },
  { name: 'Aguacate Nacional Unidad', cost: 0.30, price: 0.50, catIdx: 0 },
  { name: 'Limón Pérsico por Libra', cost: 0.40, price: 0.75, catIdx: 0 },
  { name: 'Chile Verde por Libra', cost: 0.45, price: 0.80, catIdx: 0 },
  { name: 'Zanahoria por Libra', cost: 0.20, price: 0.40, catIdx: 0 },

  // ── Carnes y Embutidos (cat 2) ──
  { name: 'Pechuga de Pollo por Libra', cost: 1.80, price: 2.75, catIdx: 1 },
  { name: 'Carne Molida Res por Libra', cost: 2.50, price: 3.85, catIdx: 1 },
  { name: 'Salchicha Viena FUD 1 kg', cost: 2.00, price: 3.25, catIdx: 1 },
  { name: 'Jamón de Pavo FUD 227 g', cost: 1.50, price: 2.45, catIdx: 1 },

  // ── Lácteos y Huevos (cat 3) ──
  { name: 'Leche Entera La Salud 1 Litro', cost: 0.85, price: 1.25, catIdx: 2 },
  { name: 'Queso Fresco Petacones 400 g', cost: 1.60, price: 2.50, catIdx: 2 },
  { name: 'Yogurt Yes Fresa 750 ml', cost: 0.90, price: 1.45, catIdx: 2 },
  { name: 'Huevos Blancos Cartón 30 Uds', cost: 3.50, price: 5.25, catIdx: 2 },
  { name: 'Crema de La Salud 225 ml', cost: 0.60, price: 0.95, catIdx: 2 },

  // ── Panadería (cat 4) ──
  { name: 'Pan Francés Bolsa 12 Uds', cost: 0.50, price: 0.80, catIdx: 3 },
  { name: 'Tortilla de Maíz Paquete 10 Uds', cost: 0.25, price: 0.40, catIdx: 3 },
  { name: 'Pan Dulce Semita Bolsa 4 Uds', cost: 0.80, price: 1.25, catIdx: 3 },

  // ── Abarrotes (cat 5) ──
  { name: 'Arroz Gallo de Oro 5 Libras', cost: 1.80, price: 2.75, catIdx: 4 },
  { name: 'Frijol Rojo de Seda 2 Libras', cost: 1.20, price: 1.95, catIdx: 4 },
  { name: 'Aceite Orisol 750 ml', cost: 1.40, price: 2.15, catIdx: 4 },
  { name: 'Azúcar Blanca El Cañal 5 Libras', cost: 1.50, price: 2.35, catIdx: 4 },
  { name: 'Sal de Mar Refisal 1 kg', cost: 0.30, price: 0.55, catIdx: 4 },
  { name: 'Pasta Spaghetti INA 200 g', cost: 0.25, price: 0.45, catIdx: 4 },
  { name: 'Salsa Tomate Naturas 227 g', cost: 0.35, price: 0.60, catIdx: 4 },
  { name: 'Consomé de Pollo Maggi 12 cubos', cost: 0.40, price: 0.65, catIdx: 4 },
  { name: 'Atún Van Camps 160 g', cost: 0.85, price: 1.35, catIdx: 4 },

  // ── Bebidas (cat 6) ──
  { name: 'Coca-Cola 2.5 Litros PET', cost: 1.00, price: 1.60, catIdx: 5 },
  { name: 'Pepsi 2.5 Litros PET', cost: 0.95, price: 1.55, catIdx: 5 },
  { name: 'Agua Cristal 600 ml', cost: 0.18, price: 0.35, catIdx: 5 },
  { name: 'Jugo Del Valle Naranja 1 Litro', cost: 0.80, price: 1.25, catIdx: 5 },
  { name: 'Gatorade Lima-Limón 600 ml', cost: 0.70, price: 1.15, catIdx: 5 },
  { name: 'Red Bull Energy 250 ml', cost: 1.20, price: 1.95, catIdx: 5 },

  // ── Snacks y Confitería (cat 7) ──
  { name: 'Chocolate Snickers 52.7 g Barra', cost: 0.90, price: 1.80, catIdx: 6 },
  { name: 'Galletas Oreo Original 432 g', cost: 1.30, price: 2.15, catIdx: 6 },
  { name: 'Boquitas Diana Elotitos 120 g', cost: 0.45, price: 0.75, catIdx: 6 },
  { name: 'Papas Pringles Original 124 g', cost: 1.50, price: 2.50, catIdx: 6 },
  { name: 'Chicle Trident Menta 30.6 g', cost: 0.55, price: 0.90, catIdx: 6 },

  // ── Cuidado Personal (cat 8) ──
  { name: 'Shampoo Head & Shoulders 375 ml', cost: 2.80, price: 4.50, catIdx: 7 },
  { name: 'Jabón Protex Antibacterial 3-pack', cost: 1.80, price: 2.95, catIdx: 7 },
  { name: 'Desodorante Rexona Men 150 ml', cost: 2.20, price: 3.65, catIdx: 7 },
  { name: 'Pasta Dental Colgate Triple Acción 75 ml', cost: 0.90, price: 1.50, catIdx: 7 },
  { name: 'Rasuradora Bic Flex3 2 Unidades Blister', cost: 2.20, price: 3.95, catIdx: 7 },

  // ── Cuidado del Hogar (cat 9) ──
  { name: 'Detergente Xedex 1 kg', cost: 1.50, price: 2.45, catIdx: 8 },
  { name: 'Cloro Magia Blanca 1 Galón', cost: 1.20, price: 1.95, catIdx: 8 },
  { name: 'Jabón Líquido Lavaplatos Axion 750 ml', cost: 1.30, price: 2.15, catIdx: 8 },
  { name: 'Papel Higiénico Scott 4 Rollos', cost: 1.60, price: 2.75, catIdx: 8 },
  { name: 'Bolsas para Basura Super Bag Rollo 10 Uds', cost: 0.70, price: 1.15, catIdx: 8 },

  // ── Cuidado del Bebé (cat 10) ──
  { name: 'Pañal Huggies Active Sec Talla M 30 Uds', cost: 5.00, price: 7.95, catIdx: 9 },
  { name: 'Fórmula Nan Optipro 1 400 g', cost: 6.50, price: 9.75, catIdx: 9 },

  // ── Mascotas (cat 11) ──
  { name: 'Alimento Perro Dog Chow Adulto 2 kg', cost: 4.00, price: 6.50, catIdx: 10 },
  { name: 'Alimento Gato Cat Chow 1.5 kg', cost: 3.80, price: 5.95, catIdx: 10 },

  // ── Cervezas y Licores (cat 12) ──
  { name: 'Cerveza Pilsener Lata 355 ml 6-pack', cost: 3.50, price: 5.50, catIdx: 11 },
  { name: 'Ron Cihuatán Indigo 8 Años 750 ml', cost: 15.00, price: 22.95, catIdx: 11 },
  { name: 'Vino Gato Negro Cabernet Sauvignon 750 ml', cost: 4.50, price: 7.25, catIdx: 11 },
];

// ─── Main Seed Function ──────────────────────────────────────────────────────

async function seed() {
  const t = await sequelize.transaction();

  try {
    console.log('🌱 Starting demo data seed...\n');

    // ── 1. Ensure we have at least one Branch ────────────────────────────────
    let branch = await Branch.findOne({ transaction: t });
    if (!branch) {
      branch = await Branch.create({
        name: 'Sucursal Centro',
        address: 'Prolongación 59 Av. Sur, San Salvador',
        phone: '2267-6767'
      }, { transaction: t });
      console.log('  ✅ Branch created: Sucursal Centro');
    } else {
      console.log(`  ℹ️  Using existing branch: ${branch.name} (id ${branch.id})`);
    }

    // ── 2. Ensure we have at least one User ──────────────────────────────────
    let user = await User.findOne({ transaction: t });
    if (!user) {
      console.log('  ❌ No users found. Please create at least one user before seeding.');
      await t.rollback();
      process.exit(1);
    }
    console.log(`  ℹ️  Using existing user: ${user.fullName || user.username} (id ${user.id})`);

    // ── 3. Categories ────────────────────────────────────────────────────────
    const existingCats = await Category.count({ transaction: t });
    let categoryIds = [];
    if (existingCats > 0) {
      const cats = await Category.findAll({ transaction: t, order: [['id', 'ASC']] });
      categoryIds = cats.map(c => c.id);
      console.log(`  ℹ️  ${existingCats} categories already exist — skipping creation`);
    } else {
      for (const cat of CATEGORIES) {
        const c = await Category.create(cat, { transaction: t });
        categoryIds.push(c.id);
      }
      console.log(`  ✅ ${CATEGORIES.length} categories created`);
    }

    // ── 4. Suppliers ─────────────────────────────────────────────────────────
    const existingSuppliers = await Supplier.count({ transaction: t });
    let supplierIds = [];
    if (existingSuppliers > 0) {
      const sups = await Supplier.findAll({ transaction: t, order: [['id', 'ASC']] });
      supplierIds = sups.map(s => s.id);
      console.log(`  ℹ️  ${existingSuppliers} suppliers already exist — skipping creation`);
    } else {
      for (const sup of SUPPLIERS) {
        const s = await Supplier.create(sup, { transaction: t });
        supplierIds.push(s.id);
      }
      console.log(`  ✅ ${SUPPLIERS.length} suppliers created`);
    }

    // ── 5. Products ──────────────────────────────────────────────────────────
    let productRecords = []; // { id, cost, price, catIdx }

    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      const barcode = generateBarcode(i + 1);

      // Check if product already exists by barCode
      let product = await Product.findOne({ where: { barCode: barcode }, transaction: t });

      if (!product) {
        product = await Product.create({
          barCode: barcode,
          name: p.name,
          isFrequent: Math.random() > 0.5,
          imagePath: null,
          categoryId: categoryIds[p.catIdx] || categoryIds[0]
        }, { transaction: t });
      }

      productRecords.push({
        id: product.id,
        cost: p.cost,
        price: p.price,
        catIdx: p.catIdx
      });
    }
    console.log(`  ✅ ${productRecords.length} products ready (created or existing)`);


    // ── 6. Purchase Transactions → Inventory Ingress ─────────────────────────
    console.log('\n  📦 Creating purchase transactions...');

    // We'll create 3 purchase batches to simulate receiving inventory
    const purchaseBatches = [
      { date: addDays(new Date(), -35), invoicePrefix: 'FAC' },
      { date: addDays(new Date(), -20), invoicePrefix: 'FAC' },
      { date: addDays(new Date(), -5),  invoicePrefix: 'FAC' }
    ];

    let purchaseCount = 0;
    let totalPurchasedProducts = 0;

    for (let pb = 0; pb < purchaseBatches.length; pb++) {
      const batch = purchaseBatches[pb];
      const supplierId = supplierIds[pb % supplierIds.length];

      // Split products among purchases (roughly 17 products each)
      const chunkSize = Math.ceil(productRecords.length / purchaseBatches.length);
      const startIdx = pb * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, productRecords.length);
      const productsForThisPurchase = productRecords.slice(startIdx, endIdx);

      // Some random products repeated in later purchases for average cost variety
      if (pb > 0) {
        const extraCount = randomInt(3, 6);
        for (let e = 0; e < extraCount; e++) {
          const rndProd = productRecords[randomInt(0, productRecords.length - 1)];
          if (!productsForThisPurchase.find(p => p.id === rndProd.id)) {
            productsForThisPurchase.push(rndProd);
          }
        }
      }

      let purchaseTotal = 0;
      const details = [];

      for (let li = 0; li < productsForThisPurchase.length; li++) {
        const prod = productsForThisPurchase[li];
        const qty = randomInt(20, 150);
        const unitCost = prod.cost * randomFloat(0.9, 1.1);
        const batchCode = generateBatchCode(pb + 1, li + 1);

        // Expiration date for perishable products (categories 0-3)
        const expDate = prod.catIdx <= 3
          ? formatDate(addDays(new Date(), randomInt(30, 180)))
          : null;

        details.push({ prod, qty, unitCost, batchCode, expDate });
        purchaseTotal += qty * unitCost;
      }

      const purchase = await Purchase.create({
        invoiceNumber: `${batch.invoicePrefix}-${String(pb + 1).padStart(5, '0')}`,
        supplierId,
        branchId: branch.id,
        totalAmount: parseFloat(purchaseTotal.toFixed(2)),
        paymentMethod: pb === 1 ? 'credit' : 'cash',
        paymentStatus: pb === 1 ? 'pending' : 'paid',
        amountPaid: pb === 1 ? 0 : parseFloat(purchaseTotal.toFixed(2)),
        dueDate: pb === 1 ? formatDate(addDays(new Date(), 30)) : null,
        createdAt: batch.date,
        updatedAt: batch.date
      }, { transaction: t });

      for (let li = 0; li < details.length; li++) {
        const d = details[li];

        await PurchaseDetail.create({
          purchaseId: purchase.id,
          productId: d.prod.id,
          batchCode: d.batchCode,
          expirationDate: d.expDate,
          quantity: d.qty,
          unitCost: parseFloat(d.unitCost.toFixed(2)),
          createdAt: batch.date,
          updatedAt: batch.date
        }, { transaction: t });

        // ── Create / Update ProductBatch ──
        await ProductBatch.create({
          branchId: branch.id,
          productId: d.prod.id,
          batchCode: d.batchCode,
          expirationDate: d.expDate,
          initialQuantity: d.qty,
          currentQuantity: d.qty,
          unitCost: parseFloat(d.unitCost.toFixed(2)),
          createdAt: batch.date,
          updatedAt: batch.date
        }, { transaction: t });

        // ── Update BranchProduct (upsert) ──
        let bp = await BranchProduct.findOne({
          where: { branchId: branch.id, productId: d.prod.id },
          transaction: t
        });

        if (bp) {
          const prevTotal = bp.totalStock;
          const prevCost = parseFloat(bp.averageCost);
          const newTotal = prevTotal + d.qty;
          const newAvgCost = ((prevCost * prevTotal) + (d.unitCost * d.qty)) / newTotal;
          await bp.update({
            totalStock: newTotal,
            averageCost: parseFloat(newAvgCost.toFixed(2)),
            salePrice: parseFloat(d.prod.price.toFixed(2))
          }, { transaction: t });
        } else {
          bp = await BranchProduct.create({
            branchId: branch.id,
            productId: d.prod.id,
            totalStock: d.qty,
            averageCost: parseFloat(d.unitCost.toFixed(2)),
            salePrice: parseFloat(d.prod.price.toFixed(2)),
            minStock: randomInt(5, 20)
          }, { transaction: t });
        }

        // ── Kardex entry for purchase ──
        const previousBranch = bp.totalStock - d.qty;
        await Kardex.create({
          productId: d.prod.id,
          branchId: branch.id,
          userId: user.id,
          quantity: d.qty,
          isInput: true,
          previousGlobalStock: previousBranch,
          previousBranchStock: previousBranch,
          type: 'purchase',
          description: `Compra ${purchase.invoiceNumber} - Lote ${d.batchCode}`,
          createdAt: batch.date,
          updatedAt: batch.date
        }, { transaction: t });

        totalPurchasedProducts++;
      }

      purchaseCount++;
    }

    console.log(`  ✅ ${purchaseCount} purchases created with ${totalPurchasedProducts} detail lines`);

    // ── 7. Cashier Turns & Sale Transactions (last 30 days) ──────────────────
    console.log('\n  🛒 Creating sales for the last 30 days...');

    const today = new Date();
    today.setHours(23, 59, 59, 0);
    const thirtyDaysAgo = addDays(today, -30);

    let totalSales = 0;
    let totalSaleDetails = 0;

    // Reload all BranchProducts to have current stock
    const allBranchProducts = await BranchProduct.findAll({
      where: { branchId: branch.id },
      transaction: t
    });

    // Build a map for quick lookup
    const bpMap = {};
    for (const bp of allBranchProducts) {
      bpMap[bp.productId] = bp;
    }

    // Get all batches for FIFO
    const allBatches = await ProductBatch.findAll({
      where: { branchId: branch.id },
      order: [['createdAt', 'ASC']],
      transaction: t
    });

    // Build batch map by productId
    const batchMap = {};
    for (const batch of allBatches) {
      if (!batchMap[batch.productId]) batchMap[batch.productId] = [];
      batchMap[batch.productId].push(batch);
    }

    // Generate sales for each day
    for (let dayOffset = -30; dayOffset <= 0; dayOffset++) {
      const currentDay = addDays(today, dayOffset);
      const dayStart = new Date(currentDay);
      dayStart.setHours(8, 0, 0, 0);
      const dayEnd = new Date(currentDay);
      dayEnd.setHours(20, 0, 0, 0);

      // Create a cashier turn for this day
      const turn = await CashierTurn.create({
        branchId: branch.id,
        userId: user.id,
        openingAmount: 100.00,
        closingAmount: null,
        declaredAmount: null,
        boxName: 'Caja 1',
        status: dayOffset === 0 ? 'open' : 'closed',
        openedAt: dayStart,
        closedAt: dayOffset === 0 ? null : dayEnd,
        createdAt: dayStart,
        updatedAt: dayEnd
      }, { transaction: t });

      // Number of sales per day (more on weekends)
      const dayOfWeek = currentDay.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const salesPerDay = isWeekend ? randomInt(15, 25) : randomInt(8, 18);

      let dayTotal = 0;

      for (let s = 0; s < salesPerDay; s++) {
        // Random time within business hours
        const saleTime = new Date(dayStart);
        saleTime.setHours(randomInt(8, 19), randomInt(0, 59), randomInt(0, 59));

        // Random number of products per sale (1-8)
        const itemCount = randomInt(1, 8);
        const saleDetails = [];
        let saleTotal = 0;

        // Pick random products for this sale
        const usedProducts = new Set();
        for (let item = 0; item < itemCount; item++) {
          // Pick a random product that has stock
          let attempts = 0;
          let prod = null;
          while (attempts < 20) {
            const rndIdx = randomInt(0, productRecords.length - 1);
            const candidate = productRecords[rndIdx];
            const bp = bpMap[candidate.id];
            if (bp && bp.totalStock > 0 && !usedProducts.has(candidate.id)) {
              prod = candidate;
              break;
            }
            attempts++;
          }

          if (!prod) continue;
          usedProducts.add(prod.id);

          const bp = bpMap[prod.id];
          const maxQty = Math.min(bp.totalStock, 5);
          if (maxQty <= 0) continue;

          const qty = randomInt(1, maxQty);

          // Find the first batch with stock (FIFO)
          const batches = batchMap[prod.id] || [];
          let batchId = null;
          let unitCostAtSale = prod.cost;
          let remaining = qty;

          for (const batch of batches) {
            if (batch.currentQuantity > 0 && remaining > 0) {
              const take = Math.min(batch.currentQuantity, remaining);
              batch.currentQuantity -= take;
              remaining -= take;
              batchId = batch.id;
              unitCostAtSale = parseFloat(batch.unitCost);
            }
          }

          if (!batchId && batches.length > 0) {
            batchId = batches[0].id;
          }

          if (!batchId) continue;

          const unitPrice = parseFloat(bp.salePrice);
          const lineTotal = unitPrice * qty;
          saleTotal += lineTotal;

          saleDetails.push({
            productId: prod.id,
            batchId,
            quantity: qty,
            unitPrice,
            discountAmount: 0,
            unitCostAtSale: parseFloat(unitCostAtSale.toFixed(2))
          });

          // Decrement stock
          bp.totalStock -= qty;
        }

        if (saleDetails.length === 0) continue;

        const paymentMethods = ['cash', 'cash', 'cash', 'card', 'card'];
        const paymentMethod = paymentMethods[randomInt(0, paymentMethods.length - 1)];

        const sale = await Sale.create({
          ticketNumber: `T-${String(totalSales + 1).padStart(6, '0')}`,
          branchId: branch.id,
          userId: user.id,
          turnId: turn.id,
          clientId: null,
          paymentMethod,
          totalAmount: parseFloat(saleTotal.toFixed(2)),
          discountAmount: 0,
          amountCash: paymentMethod === 'cash' ? parseFloat(saleTotal.toFixed(2)) : 0,
          amountCredit: 0,
          amountCard: paymentMethod === 'card' ? parseFloat(saleTotal.toFixed(2)) : 0,
          createdAt: saleTime,
          updatedAt: saleTime
        }, { transaction: t });

        for (const detail of saleDetails) {
          await SaleDetail.create({
            saleId: sale.id,
            ...detail,
            createdAt: saleTime,
            updatedAt: saleTime
          }, { transaction: t });

          // Kardex for sale
          const bp = bpMap[detail.productId];
          await Kardex.create({
            productId: detail.productId,
            branchId: branch.id,
            userId: user.id,
            quantity: detail.quantity,
            isInput: false,
            previousGlobalStock: bp.totalStock + detail.quantity,
            previousBranchStock: bp.totalStock + detail.quantity,
            type: 'sale',
            description: `Venta ${sale.ticketNumber}`,
            createdAt: saleTime,
            updatedAt: saleTime
          }, { transaction: t });

          totalSaleDetails++;
        }

        dayTotal += saleTotal;
        totalSales++;
      }

      // Close the cashier turn with totals
      if (dayOffset !== 0) {
        const declaredAmount = dayTotal + 100 + randomFloat(-5, 5);
        await turn.update({
          closingAmount: parseFloat((dayTotal + 100).toFixed(2)),
          declaredAmount: parseFloat(declaredAmount.toFixed(2))
        }, { transaction: t });
      }
    }

    console.log(`  ✅ ${totalSales} sales created with ${totalSaleDetails} detail lines`);

    // ── 8. Update BranchProducts with final stock ────────────────────────────
    console.log('\n  📊 Updating final stock levels...');
    for (const prodId of Object.keys(bpMap)) {
      const bp = bpMap[prodId];
      await BranchProduct.update(
        { totalStock: bp.totalStock },
        { where: { id: bp.id }, transaction: t }
      );
    }

    // Update batch quantities
    for (const prodId of Object.keys(batchMap)) {
      for (const batch of batchMap[prodId]) {
        await ProductBatch.update(
          { currentQuantity: Math.max(0, batch.currentQuantity) },
          { where: { id: batch.id }, transaction: t }
        );
      }
    }

    console.log('  ✅ Stock levels updated');

    // ── Commit ───────────────────────────────────────────────────────────────
    await t.commit();

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  🎉 Demo data seeded successfully!');
    console.log('══════════════════════════════════════════════════════');
    console.log(`  • Categories:  ${CATEGORIES.length}`);
    console.log(`  • Suppliers:   ${SUPPLIERS.length}`);
    console.log(`  • Products:    ${productRecords.length}`);
    console.log(`  • Purchases:   ${purchaseCount} (${totalPurchasedProducts} items)`);
    console.log(`  • Sales:       ${totalSales} (${totalSaleDetails} items)`);
    console.log(`  • Date range:  ${formatDate(thirtyDaysAgo)} → ${formatDate(today)}`);
    console.log('══════════════════════════════════════════════════════\n');

  } catch (error) {
    await t.rollback();
    console.error('\n  ❌ Seed failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
