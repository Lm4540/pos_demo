'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Clients', 'dui', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Clients', 'dui');
  }
};
