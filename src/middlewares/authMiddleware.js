const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { get } = require("../config/database");
const { logStep, logError, truncateToken } = require("../utils/logger");

async function authMiddleware(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    logStep("REQUEST", { authorizationHeader: authHeader });
    const [scheme, token] = authHeader.split(" ");
    logStep("TOKEN_RECEIVED", {
      scheme,
      tokenPreview: truncateToken(token),
    });

    if (scheme !== "Bearer" || !token) {
      const error = new Error("Unauthorized.");
      error.status = 401;
      logError("AUTH_HEADER_INVALID", error);
      throw error;
    }

    const payload = jwt.verify(token, env.jwtSecret);
    logStep("JWT_DECODED", {
      sub: payload && payload.sub,
      phone: payload && payload.phone,
      exp: payload && payload.exp,
    });
    const userId = Number(payload.sub);
    const user = await get("SELECT id, phone, created_at FROM users WHERE id = ?", [userId]);

    if (!user) {
      const error = new Error("Unauthorized.");
      error.status = 401;
      logError("USER_NOT_FOUND", error);
      throw error;
    }

    req.user = user;
    next();
  } catch (_error) {
    logError("AUTH_MIDDLEWARE_FAIL", _error);
    const error = new Error("Unauthorized.");
    error.status = 401;
    next(error);
  }
}

module.exports = authMiddleware;
