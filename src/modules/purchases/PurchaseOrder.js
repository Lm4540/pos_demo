const { Model, DataTypes } = require('sequelize');

class PurchaseOrder extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      orderNumber: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      supplierName: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      supplierId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      status: {
        type: DataTypes.ENUM('pending', 'received', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      orderDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      expectedDeliveryDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      purchaseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'PurchaseOrder',
      tableName: 'purchase_orders',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.Supplier, { foreignKey: 'supplierId', as: 'supplier' });
    this.belongsTo(models.Purchase, { foreignKey: 'purchaseId', as: 'purchase' });
    this.hasMany(models.PurchaseOrderDetail, { foreignKey: 'purchaseOrderId', as: 'details' });
  }
}

module.exports = PurchaseOrder;
