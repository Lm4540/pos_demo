'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Crear tabla Categories
    await queryInterface.createTable('Categories', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
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
        allowNull: true
      }
    });

    // 2. Crear tabla Promotions
    await queryInterface.createTable('Promotions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('percentage', 'fixed_price', 'bulk'),
        allowNull: false
      },
      value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      buyQty: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      payQty: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      startDate: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      endDate: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
        allowNull: true
      }
    });

    // 3. Añadir categoryId a la tabla Products
    await queryInterface.addColumn('Products', 'categoryId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Categories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // 4. Añadir discountAmount a SaleDetails
    await queryInterface.addColumn('SaleDetails', 'discountAmount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });

    // 5. Añadir discountAmount a Sales
    await queryInterface.addColumn('Sales', 'discountAmount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Sales', 'discountAmount');
    await queryInterface.removeColumn('SaleDetails', 'discountAmount');
    await queryInterface.removeColumn('Products', 'categoryId');
    await queryInterface.dropTable('Promotions');
    await queryInterface.dropTable('Categories');
  }
};
