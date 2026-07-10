const { Model, DataTypes } = require('sequelize');

class SupplierPayment extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      purchaseId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      amountPaid: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      paymentDate: {
        type: DataTypes.DATE,
        allowNull: false
      },
      notes: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      paymentSource: {
        type: DataTypes.ENUM('cashier', 'external'),
        allowNull: true,
        defaultValue: null
      },
      turnId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      transactionRef: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'SupplierPayment',
      tableName: 'supplierpayments',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Purchase, { foreignKey: 'purchaseId', as: 'purchase' });
    this.belongsTo(models.CashierTurn, { foreignKey: 'turnId', as: 'turn' });
  }
}

module.exports = SupplierPayment;
