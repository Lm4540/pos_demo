const { Model, DataTypes } = require('sequelize');

class CashierTurn extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      openingAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      closingAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null
      },
      declaredAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null
      },
      boxName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Caja 1'
      },
      status: {
        type: DataTypes.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
      },
      openedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      closedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'CashierTurn',
      tableName: 'CashierTurns',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.hasMany(models.CashierMovement, { foreignKey: 'turnId', as: 'movements' });
  }
}

module.exports = CashierTurn;
