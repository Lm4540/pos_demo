const { Model, DataTypes } = require('sequelize');

class Supplier extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'Supplier',
      tableName: 'suppliers',
      timestamps: true,
      paranoid: true
    });
    return this;
  }

  static associate(models) {
    this.hasMany(models.Purchase, { foreignKey: 'supplierId', as: 'purchases' });
  }
}

module.exports = Supplier;
