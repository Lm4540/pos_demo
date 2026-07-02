require('dotenv').config();

module.exports = {
  rpName: process.env.WEBAUTHN_RP_NAME || 'RG Simple POS',
  rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
  origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'
};
