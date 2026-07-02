'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CashierTurns', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      branchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Branches',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      openingAmount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      closingAmount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: null
      },
      status: {
        type: Sequelize.ENUM('open', 'closed'),
        allowNull: false,
        defaultValue: 'open'
      },
      openedAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      closedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
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
    await queryInterface.dropTable('CashierTurns');
  }
};
