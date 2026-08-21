const { Model, DataTypes } = require('sequelize');

class PurchaseOrderDetail extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      purchaseOrderId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      unitCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'PurchaseOrderDetail',
      tableName: 'purchase_order_details',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId', as: 'order' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = PurchaseOrderDetail;
