const { Model, DataTypes } = require('sequelize');

class InventoryAudit extends Model {
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
      sector: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('draft', 'completed'),
        allowNull: false,
        defaultValue: 'draft'
      }
    }, {
      sequelize,
      modelName: 'InventoryAudit',
      tableName: 'InventoryAudits',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.hasMany(models.InventoryAuditDetail, { foreignKey: 'inventoryAuditId', as: 'details' });
  }
}

module.exports = InventoryAudit;
