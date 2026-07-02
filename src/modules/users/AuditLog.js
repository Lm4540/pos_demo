const { Model, DataTypes } = require('sequelize');

class AuditLog extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      details: {
        type: DataTypes.JSON,
        allowNull: false,
        get() {
          const rawValue = this.getDataValue('details');
          if (!rawValue) return {};
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        },
        set(value) {
          this.setDataValue('details', typeof value === 'object' ? value : JSON.parse(value));
        }
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'suditlogs',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
  }
}

module.exports = AuditLog;
