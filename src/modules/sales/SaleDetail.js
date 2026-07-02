const { Model, DataTypes } = require('sequelize');

class SaleDetail extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      saleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      batchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      unitPrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      discountAmount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      unitCostAtSale: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'SaleDetail',
      tableName: 'SaleDetails',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Sale, { foreignKey: 'saleId', as: 'sale' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
    this.belongsTo(models.ProductBatch, { foreignKey: 'batchId', as: 'batch' });
  }
}

module.exports = SaleDetail;
