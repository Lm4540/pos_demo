const { AuditLog } = require('../models');

/**
 * Persists an action to the AuditLogs database.
 * @param {Object} params
 * @param {number|null} params.userId - User who performed the action
 * @param {number|null} params.branchId - Branch context
 * @param {string} params.action - Slug style dot-notation (e.g. auth.login_failed, pos.sale_voided)
 * @param {Object} params.details - Details payload (converted to JSON in DB)
 * @param {string|null} params.ipAddress - Client IP address
 */
const logAction = async ({ userId, branchId, action, details = {}, ipAddress = null }) => {
  try {
    await AuditLog.create({
      userId: userId || null,
      branchId: branchId || null,
      action,
      details,
      ipAddress
    });
  } catch (error) {
    console.error('Error writing to AuditLog:', error);
  }
};

module.exports = {
  logAction
};
