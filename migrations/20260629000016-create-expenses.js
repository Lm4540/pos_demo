'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Expenses', {
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
      description: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      category: {
        type: Sequelize.ENUM('services', 'supplies', 'maintenance', 'other'),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      receiptPath: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      expenseDate: {
        type: Sequelize.DATEONLY,
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
    await queryInterface.dropTable('Expenses');
  }
};
