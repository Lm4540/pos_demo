const { Model, DataTypes } = require('sequelize');

class CreditPayment extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      receiptNumber: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      clientId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      turnId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      amountPaid: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'CreditPayment',
      tableName: 'creditpayments',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Client, { foreignKey: 'clientId', as: 'client' });
    this.belongsTo(models.CashierTurn, { foreignKey: 'turnId', as: 'turn' });
  }
}

module.exports = CreditPayment;
