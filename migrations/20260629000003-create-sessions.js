'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Sessions', {
      session_id: {
        type: Sequelize.STRING(128),
        primaryKey: true
      },
      expires: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      data: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
    await queryInterface.dropTable('Sessions');
  }
};
