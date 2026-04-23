function errorMiddleware(error, _req, res, _next) {
  const status = error.status || 500;
  const message = status >= 500 ? "Internal server error." : error.message;
  res.status(status).json({ message });
}

module.exports = errorMiddleware;
