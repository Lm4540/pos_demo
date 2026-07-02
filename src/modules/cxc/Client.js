const { Model, DataTypes } = require('sequelize');

class Client extends Model {
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
      name: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      dui: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
        unique: true
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      },
      creditLimit: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      currentBalance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      creditDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30
      }
    }, {
      sequelize,
      modelName: 'Client',
      tableName: 'clients',
      timestamps: true,
      paranoid: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
  }
}

module.exports = Client;
