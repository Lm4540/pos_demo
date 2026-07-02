const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

const options = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD === '' ? null : (process.env.DB_PASSWORD || null),
  database: process.env.DB_NAME || 'punto_venta',
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 mins
  expiration: 86400000, // 24 hours
  createDatabaseTable: false, // Table is created via migrations (Sessions)
  schema: {
    tableName: 'Sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
};

const sessionStore = new MySQLStore(options);

// Monkeypatch sessionStore.set to map user ID to the Sessions table
const originalSet = sessionStore.set;
sessionStore.set = function(sessionId, session, callback) {
  originalSet.call(sessionStore, sessionId, session, (err) => {
    if (err) {
      if (callback) return callback(err);
      return;
    }
    if (session && session.userId) {
      const { sequelize } = require('../core/models');
      sequelize.query('UPDATE Sessions SET userId = ? WHERE session_id = ?', {
        replacements: [session.userId, sessionId]
      }).then(() => {
        if (callback) callback(null);
      }).catch(dbErr => {
        console.error('Error updating userId in Sessions table:', dbErr);
        if (callback) callback(null);
      });
    } else {
      if (callback) callback(null);
    }
  });
};

module.exports = {
  sessionConfig: {
    key: 'rg_pos_sid',
    secret: process.env.SESSION_SECRET || 'fallback_secret_key_rg_pos',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  }
};
