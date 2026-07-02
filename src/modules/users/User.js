const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

class User extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      branchId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      roleId: {
        type: DataTypes.ENUM('admin', 'supervisor', 'cashier'),
        allowNull: false
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      fullName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      specialPermissions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        get() {
          const rawValue = this.getDataValue('specialPermissions');
          if (!rawValue) return {};
          return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        },
        set(value) {
          this.setDataValue('specialPermissions', typeof value === 'object' ? value : JSON.parse(value));
        }
      },
      loginAttempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.ENUM('active', 'blocked', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
      }
    }, {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: true,
      paranoid: true,
      hooks: {
        beforeSave: async (user) => {
          if (user.changed('passwordHash') && !user.passwordHash.startsWith('$2a$')) {
            const salt = await bcrypt.genSalt(10);
            user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
          }
        }
      }
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'branchId', as: 'branch' });
    this.hasMany(models.WebAuthnCredential, { foreignKey: 'userId', as: 'credentials' });
    this.hasMany(models.AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
  }

  async validatePassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }
}

module.exports = User;
