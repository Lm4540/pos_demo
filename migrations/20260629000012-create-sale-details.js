'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SaleDetails', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Sales',
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
      batchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ProductBatches',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      unitPrice: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      unitCostAtSale: {
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
    await queryInterface.dropTable('SaleDetails');
  }
};
