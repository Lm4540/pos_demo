const { Model, DataTypes } = require('sequelize');

class Category extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'Category',
      tableName: 'Categories',
      timestamps: true,
      paranoid: true
    });
    return this;
  }

  static associate(models) {
    this.hasMany(models.Product, { foreignKey: 'categoryId', as: 'products' });
    this.hasMany(models.Promotion, { foreignKey: 'categoryId', as: 'promotions' });
  }
}

module.exports = Category;
