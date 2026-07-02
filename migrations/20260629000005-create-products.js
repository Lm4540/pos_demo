'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Products', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      barCode: {
        type: Sequelize.STRING(50),
        allowNull: true,
        unique: true,
        defaultValue: null
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false
      },
      isFrequent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      imagePath: {
        type: Sequelize.STRING(255),
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
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Products');
  }
};
