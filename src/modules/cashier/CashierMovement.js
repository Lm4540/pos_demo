const { Model, DataTypes } = require('sequelize');

class CashierMovement extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      turnId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('withdrawal', 'deposit'),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'CashierMovement',
      tableName: 'cashiermovements',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.CashierTurn, { foreignKey: 'turnId', as: 'turn' });
  }
}

module.exports = CashierMovement;
