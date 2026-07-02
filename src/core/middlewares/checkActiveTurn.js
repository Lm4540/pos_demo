const { CashierTurn } = require('../models');

module.exports = async (req, res, next) => {
  try {
    const activeTurn = await CashierTurn.findOne({
      where: {
        userId: req.user.id,
        branchId: req.user.branchId,
        status: 'open'
      }
    });

    if (activeTurn) {
      req.activeTurn = activeTurn;
      res.locals.activeTurn = activeTurn; // Expose to templates if needed
      return next();
    }

    const message = 'Debe abrir un turno de caja antes de realizar esta operación.';
    
    if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.headers['sec-fetch-mode'] === 'cors' || req.method !== 'GET') {
      return res.status(403).json({
        success: false,
        message,
        redirectUrl: '/cashier/open'
      });
    }

    return res.redirect('/cashier/open');
  } catch (error) {
    return next(error);
  }
};
