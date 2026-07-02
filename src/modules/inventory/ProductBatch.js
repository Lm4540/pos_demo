const { Model, DataTypes } = require('sequelize');

class ProductBatch extends Model {
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
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      batchCode: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      expirationDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null
      },
      initialQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      currentQuantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      unitCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'ProductBatch',
      tableName: 'ProductBatches',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = ProductBatch;
