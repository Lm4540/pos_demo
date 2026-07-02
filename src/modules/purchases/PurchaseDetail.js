const { Model, DataTypes } = require('sequelize');

class PurchaseDetail extends Model {
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
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      unitCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'PurchaseDetail',
      tableName: 'purchasedetails',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Purchase, { foreignKey: 'purchaseId', as: 'purchase' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = PurchaseDetail;
