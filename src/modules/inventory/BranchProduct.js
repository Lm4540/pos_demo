const { Model, DataTypes } = require('sequelize');

class BranchProduct extends Model {
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
      totalStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      averageCost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      salePrice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      minStock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    }, {
      sequelize,
      modelName: 'BranchProduct',
      tableName: 'BranchProducts',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
  }
}

module.exports = BranchProduct;
