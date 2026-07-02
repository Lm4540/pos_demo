'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Alter Sales Table
    await queryInterface.addColumn('Sales', 'amountCash', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await queryInterface.addColumn('Sales', 'amountCredit', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await queryInterface.addColumn('Sales', 'amountCard', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });

    // Modify paymentMethod enum
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Sales\` MODIFY COLUMN \`paymentMethod\` ENUM('cash', 'credit', 'card', 'split') NOT NULL;
    `);

    // 2. Alter CashierTurns Table
    await queryInterface.addColumn('CashierTurns', 'declaredAmount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: null
    });

    // 3. Alter BranchTransfers Table
    await queryInterface.addColumn('BranchTransfers', 'receivedByUserId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    await queryInterface.addColumn('BranchTransfers', 'receivedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    // Set default value for status to 'transit'
    await queryInterface.sequelize.query(`
      ALTER TABLE \`BranchTransfers\` ALTER COLUMN \`status\` SET DEFAULT 'transit';
    `);

    // 4. Alter BranchTransferDetails Table
    await queryInterface.addColumn('BranchTransferDetails', 'receivedQuantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    // 5. Alter BranchProducts Table
    await queryInterface.addColumn('BranchProducts', 'minStock', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // 6. Alter Purchases Table
    await queryInterface.addColumn('Purchases', 'paymentMethod', {
      type: Sequelize.ENUM('cash', 'credit'),
      allowNull: false,
      defaultValue: 'cash'
    });
    await queryInterface.addColumn('Purchases', 'paymentStatus', {
      type: Sequelize.ENUM('paid', 'pending'),
      allowNull: false,
      defaultValue: 'paid'
    });
    await queryInterface.addColumn('Purchases', 'amountPaid', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await queryInterface.addColumn('Purchases', 'dueDate', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      defaultValue: null
    });

    // 7. Create SupplierPayments Table
    await queryInterface.createTable('SupplierPayments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      purchaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Purchases', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      amountPaid: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      paymentDate: {
        type: Sequelize.DATE,
        allowNull: false
      },
      notes: {
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
  },

  async down(queryInterface, Sequelize) {
    // Drop Table SupplierPayments
    await queryInterface.dropTable('SupplierPayments');

    // Remove added columns from Purchases
    await queryInterface.removeColumn('Purchases', 'paymentMethod');
    await queryInterface.removeColumn('Purchases', 'paymentStatus');
    await queryInterface.removeColumn('Purchases', 'amountPaid');
    await queryInterface.removeColumn('Purchases', 'dueDate');

    // Remove added columns from BranchProducts
    await queryInterface.removeColumn('BranchProducts', 'minStock');

    // Remove added columns from BranchTransferDetails
    await queryInterface.removeColumn('BranchTransferDetails', 'receivedQuantity');

    // Remove added columns and revert status default on BranchTransfers
    await queryInterface.removeColumn('BranchTransfers', 'receivedByUserId');
    await queryInterface.removeColumn('BranchTransfers', 'receivedAt');
    await queryInterface.sequelize.query(`
      ALTER TABLE \`BranchTransfers\` ALTER COLUMN \`status\` SET DEFAULT 'completed';
    `);

    // Remove declaredAmount from CashierTurns
    await queryInterface.removeColumn('CashierTurns', 'declaredAmount');

    // Revert paymentMethod enum modifications in Sales and remove columns
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Sales\` MODIFY COLUMN \`paymentMethod\` ENUM('cash', 'credit') NOT NULL;
    `);
    await queryInterface.removeColumn('Sales', 'amountCash');
    await queryInterface.removeColumn('Sales', 'amountCredit');
    await queryInterface.removeColumn('Sales', 'amountCard');
  }
};
