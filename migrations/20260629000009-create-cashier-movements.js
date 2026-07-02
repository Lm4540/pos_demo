'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CashierMovements', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      turnId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'CashierTurns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT' // Keep cashier turns history intact
      },
      type: {
        type: Sequelize.ENUM('withdrawal', 'deposit'),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      reason: {
        type: Sequelize.STRING(255),
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
    await queryInterface.dropTable('CashierMovements');
  }
};
