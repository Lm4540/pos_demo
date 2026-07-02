const { Model, DataTypes } = require('sequelize');

class BranchTransferDetail extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      transferId: {
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
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      receivedQuantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      unitCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'BranchTransferDetail',
      tableName: 'branchtransferdetails',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.BranchTransfer, { foreignKey: 'transferId', as: 'transfer' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = BranchTransferDetail;
