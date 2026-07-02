'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('CashierTurns', 'boxName', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'Caja 1'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('CashierTurns', 'boxName');
  }
};
