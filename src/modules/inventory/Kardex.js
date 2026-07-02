const { Model, DataTypes } = require('sequelize');

class Kardex extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      productId: {
        type: DataTypes.INTEGER,
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
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      isInput: {
        type: DataTypes.BOOLEAN,
        allowNull: false
      },
      previousGlobalStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      previousBranchStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      type: {
        type: DataTypes.ENUM('sale', 'purchase', 'adjustment', 'transfer_out', 'transfer_in', 'void_sale'),
        allowNull: false
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'Kardex',
      tableName: 'KardexLogs',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

module.exports = Kardex;
