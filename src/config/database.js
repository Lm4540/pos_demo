const { Sequelize } = require('sequelize');
require('dotenv').config();

const config = {
  username: process.env.DB_USER || 'demo_user',
  password: process.env.DB_PASSWORD === '' ? null : (process.env.DB_PASSWORD || 'sigmaq'),
  database: process.env.DB_NAME || 'punto_venta',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  dialect: 'mysql',
  timezone: '-06:00', // America/El_Salvador timezone (CST, UTC-6)
  dialectOptions: {
    dateStrings: true,
    typeCast: true
  },
  define: {
    timestamps: true,
    freezeTableName: false
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false
};
const sequelize = new Sequelize(config.database, config.username, config.password, config);
module.exports = {
  sequelize,
  Sequelize,
  development: config,
  production: config
};
