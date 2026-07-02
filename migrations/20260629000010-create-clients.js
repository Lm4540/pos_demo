'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Clients', {
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
      name: {
        type: Sequelize.STRING(150),
        allowNull: false
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: null
      },
      creditLimit: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      currentBalance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      creditDays: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Clients');
  }
};
