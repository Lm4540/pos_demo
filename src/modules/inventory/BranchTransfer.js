const { Model, DataTypes } = require('sequelize');

class BranchTransfer extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      transferNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      fromBranchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      toBranchId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      receivedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      status: {
        type: DataTypes.ENUM('transit', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'transit'
      }
    }, {
      sequelize,
      modelName: 'BranchTransfer',
      tableName: 'branchtransfers',
      timestamps: true
    });
    return this;
  }

  static associate(models) {
    this.belongsTo(models.Branch, { foreignKey: 'fromBranchId', as: 'fromBranch' });
    this.belongsTo(models.Branch, { foreignKey: 'toBranchId', as: 'toBranch' });
    this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    this.belongsTo(models.User, { foreignKey: 'receivedByUserId', as: 'receivedByUser' });
    this.hasMany(models.BranchTransferDetail, { foreignKey: 'transferId', as: 'details' });
  }
}

module.exports = BranchTransfer;
