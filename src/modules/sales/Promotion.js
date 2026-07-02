const { Model, DataTypes } = require('sequelize');

class Promotion extends Model {
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
      },
      type: {
        type: DataTypes.ENUM('percentage', 'fixed_price', 'bulk'),
        allowNull: false
      },
      value: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true
      },
      buyQty: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      payQty: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    }, {
      sequelize,
      modelName: 'Promotion',
      tableName: 'Promotions',
      timestamps: true,
      paranoid: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
    this.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
  }
}

module.exports = Promotion;
