const { Model, DataTypes } = require('sequelize');

class Sale extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      ticketNumber: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      turnId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'credit', 'card', 'split'),
        allowNull: false
      },
      totalAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      discountAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      amountCash: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      amountCredit: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      amountCard: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      cardTransactionRef: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'Sale',
      tableName: 'sales',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.belongsTo(models.CashierTurn, { foreignKey: 'turnId', as: 'turn' });
    this.belongsTo(models.Client, { foreignKey: 'clientId', as: 'client' });
    this.hasMany(models.SaleDetail, { foreignKey: 'saleId', as: 'details' });
  }
}

module.exports = Sale;
