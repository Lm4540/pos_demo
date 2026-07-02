const { Model, DataTypes } = require('sequelize');

class InventoryAuditDetail extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      inventoryAuditId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      expectedQuantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      countedQuantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      discrepancy: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      justification: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'InventoryAuditDetail',
      tableName: 'InventoryAuditDetails',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.InventoryAudit, { foreignKey: 'inventoryAuditId', as: 'audit' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = InventoryAuditDetail;
