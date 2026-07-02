'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create KardexLogs table
    await queryInterface.createTable('KardexLogs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      branchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      isInput: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      previousGlobalStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      previousBranchStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // 2. Create BranchTransfers table
    await queryInterface.createTable('BranchTransfers', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      transferNumber: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      fromBranchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      toBranchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'completed'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // 3. Create BranchTransferDetails table
    await queryInterface.createTable('BranchTransferDetails', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      transferId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'BranchTransfers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      batchCode: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      unitCost: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('BranchTransferDetails');
    await queryInterface.dropTable('BranchTransfers');
    await queryInterface.dropTable('KardexLogs');
  }
};
