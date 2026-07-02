const { Model, DataTypes } = require('sequelize');

class WebAuthnCredential extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.STRING(255),
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      publicKey: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      counter: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      deviceType: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      modelName: 'WebAuthnCredential',
      tableName: 'WebAuthnCredentials',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  }
}

module.exports = WebAuthnCredential;
