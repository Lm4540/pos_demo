const { Model, DataTypes } = require('sequelize');

class Purchase extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      invoiceNumber: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      supplierId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'credit'),
        allowNull: false,
        defaultValue: 'cash'
      },
      paymentStatus: {
        type: DataTypes.ENUM('paid', 'pending'),
        allowNull: false,
        defaultValue: 'paid'
      },
      amountPaid: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      dueDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'Purchase',
      tableName: 'purchases',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.Supplier, { foreignKey: 'supplierId', as: 'supplier' });
    this.hasMany(models.PurchaseDetail, { foreignKey: 'purchaseId', as: 'details' });
    this.hasMany(models.SupplierPayment, { foreignKey: 'purchaseId', as: 'payments' });
  }
}

module.exports = Purchase;
