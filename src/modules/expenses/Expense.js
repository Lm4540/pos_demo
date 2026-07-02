const { Model, DataTypes } = require('sequelize');

class Expense extends Model {
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
      description: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      category: {
        type: DataTypes.ENUM('services', 'supplies', 'maintenance', 'other'),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      receiptPath: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      expenseDate: {
        type: DataTypes.DATEONLY,
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'Expense',
      tableName: 'Expenses',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
  }
}

module.exports = Expense;
