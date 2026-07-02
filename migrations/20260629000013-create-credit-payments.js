'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CreditPayments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      receiptNumber: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      clientId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Clients',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      turnId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'CashierTurns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      amountPaid: {
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
    await queryInterface.dropTable('CreditPayments');
  }
};
