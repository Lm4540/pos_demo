const { Model, DataTypes } = require('sequelize');

class Branch extends Model {
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
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'Branch',
      tableName: 'branches',
      timestamps: true,
      paranoid: true // Handles deletedAt soft deletes
    });
    return this;
  }

  static associate(models) {
    this.hasMany(models.User, { foreignKey: 'branchId', as: 'users' });
    this.hasMany(models.BranchProduct, { foreignKey: 'branchId', as: 'branchProducts' });
    this.hasMany(models.ProductBatch, { foreignKey: 'branchId', as: 'batches' });
    this.hasMany(models.Client, { foreignKey: 'branchId', as: 'clients' });
    this.hasMany(models.AuditLog, { foreignKey: 'branchId', as: 'auditLogs' });
  }
}

module.exports = Branch;
