const { Model, DataTypes } = require('sequelize');

class Product extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      barCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        defaultValue: null
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      isFrequent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      imagePath: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'Product',
      tableName: 'Products',
      timestamps: true,
      paranoid: true
    });
    return this;
  }

  static associate(models) {
    this.hasMany(models.BranchProduct, { foreignKey: 'productId', as: 'branchProducts' });
    this.hasMany(models.ProductBatch, { foreignKey: 'productId', as: 'batches' });
    this.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
    this.hasMany(models.Promotion, { foreignKey: 'productId', as: 'promotions' });
  }
}

module.exports = Product;
