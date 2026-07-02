'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('WebAuthnCredentials', {
      id: {
        type: Sequelize.STRING(255),
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      publicKey: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      counter: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      deviceType: {
        type: Sequelize.STRING(32),
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
    await queryInterface.dropTable('WebAuthnCredentials');
  }
};
