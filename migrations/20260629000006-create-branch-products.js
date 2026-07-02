'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('BranchProducts', {
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
        onDelete: 'CASCADE'
      },
      totalStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      averageCost: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      salePrice: {
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

    // Add unique constraint for branchId + productId
    await queryInterface.addConstraint('BranchProducts', {
      fields: ['branchId', 'productId'],
      type: 'unique',
      name: 'branch_product_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('BranchProducts');
  }
};
