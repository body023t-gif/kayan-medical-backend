const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { get } = require("../config/database");

async function authMiddleware(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      const error = new Error("Unauthorized.");
      error.status = 401;
      throw error;
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const userId = Number(payload.sub);
    const user = await get("SELECT id, phone, created_at FROM users WHERE id = ?", [userId]);

    if (!user) {
      const error = new Error("Unauthorized.");
      error.status = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (_error) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    next(error);
  }
}

module.exports = authMiddleware;
