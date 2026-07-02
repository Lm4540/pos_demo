'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PurchaseDetails', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      purchaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Purchases',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      batchCode: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      expirationDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        defaultValue: null
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
    await queryInterface.dropTable('PurchaseDetails');
  }
};
