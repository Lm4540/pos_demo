const { Model, DataTypes } = require('sequelize');

class ErrorLog extends Model {
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
      route: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      method: {
        type: DataTypes.STRING(20),
        allowNull: false
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      errorStack: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      payload: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        get() {
          const rawValue = this.getDataValue('payload');
          if (!rawValue) return {};
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        },
        set(value) {
          this.setDataValue('payload', typeof value === 'object' ? value : JSON.parse(value));
        }
      }
    }, {
      sequelize,
      modelName: 'ErrorLog',
      tableName: 'errorlogs',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
  }
}

module.exports = ErrorLog;
