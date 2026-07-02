// Global Error Handler placeholder
module.exports = (err, req, res, next) => {
  console.error(err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Ha ocurrido un error interno en el servidor.',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};
