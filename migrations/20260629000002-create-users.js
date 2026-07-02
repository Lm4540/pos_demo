'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      branchId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: {
          model: 'Branches',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      roleId: {
        type: Sequelize.ENUM('admin', 'supervisor', 'cashier'),
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      fullName: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      specialPermissions: {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null
      },
      loginAttempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.ENUM('active', 'blocked', 'inactive'),
        allowNull: false,
        defaultValue: 'active'
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
    await queryInterface.dropTable('Users');
  }
};
