const { sequelize, Sequelize } = require('../../config/database');

const Branch = require('../../modules/branches/Branch');
const User = require('../../modules/users/User');
const WebAuthnCredential = require('../../modules/users/WebAuthnCredential');
const AuditLog = require('../../modules/users/AuditLog');
const ErrorLog = require('../../modules/users/ErrorLog');
const Product = require('../../modules/inventory/Product');
const BranchProduct = require('../../modules/inventory/BranchProduct');
const ProductBatch = require('../../modules/inventory/ProductBatch');
const Supplier = require('../../modules/purchases/Supplier');
const Client = require('../../modules/cxc/Client');
const Purchase = require('../../modules/purchases/Purchase');
const PurchaseDetail = require('../../modules/purchases/PurchaseDetail');
const CashierTurn = require('../../modules/cashier/CashierTurn');
const CashierMovement = require('../../modules/cashier/CashierMovement');
const Sale = require('../../modules/sales/Sale');
const SaleDetail = require('../../modules/sales/SaleDetail');
const CreditPayment = require('../../modules/cxc/CreditPayment');
const Expense = require('../../modules/expenses/Expense');
const Kardex = require('../../modules/inventory/Kardex');
const BranchTransfer = require('../../modules/inventory/BranchTransfer');
const BranchTransferDetail = require('../../modules/inventory/BranchTransferDetail');
const SupplierPayment = require('../../modules/purchases/SupplierPayment');
const InventoryAudit = require('../../modules/inventory/InventoryAudit');
const InventoryAuditDetail = require('../../modules/inventory/InventoryAuditDetail');
const Category = require('../../modules/inventory/Category');
const Promotion = require('../../modules/sales/Promotion');

const models = {
  Branch,
  User,
  WebAuthnCredential,
  AuditLog,
  ErrorLog,
  Product,
  BranchProduct,
  ProductBatch,
  Supplier,
  Client,
  Purchase,
  PurchaseDetail,
  CashierTurn,
  CashierMovement,
  Sale,
  SaleDetail,
  CreditPayment,
  Expense,
  Kardex,
  BranchTransfer,
  BranchTransferDetail,
  SupplierPayment,
  InventoryAudit,
  InventoryAuditDetail,
  Category,
  Promotion
};

// Initialize models
Object.values(models).forEach(model => model.init(sequelize));

// Setup associations
Object.values(models).forEach(model => {
  if (typeof model.associate === 'function') {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models
};
