'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ProductBatches', {
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
      batchCode: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      expirationDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        defaultValue: null
      },
      initialQuantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      currentQuantity: {
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
    await queryInterface.dropTable('ProductBatches');
  }
};
