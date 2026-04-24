const { logStep, logError, truncateToken } = require("../utils/logger");

function requireFirebaseToken(body) {
  logStep("REQUEST", { bodySnapshot: body });
  const token =
    body?.firebaseToken ||
    body?.firebase_token ||
    body?.idToken;
  logStep("TOKEN_RECEIVED", {
    tokenType: typeof token,
    tokenPreview: truncateToken(token),
  });

  if (!token || typeof token !== "string") {
    const error = new Error("firebase_token is required.");
    error.status = 400;
    logError("VALIDATION_FAIL", error);
    throw error;
  }

  return token;
}

function requireOrderPayload(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Request body is required.");
    error.status = 400;
    throw error;
  }

  const { items, city, details } = body;

  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("items must be a non-empty array.");
    error.status = 400;
    throw error;
  }

  for (const item of items) {
    if (!Number.isInteger(Number(item.product_id)) || Number(item.product_id) <= 0) {
      const error = new Error("Each item must include a valid product_id.");
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
      const error = new Error("Each item must include a positive quantity.");
      error.status = 400;
      throw error;
    }
  }

  if (!city || typeof city !== "string") {
    const error = new Error("city is required.");
    error.status = 400;
    throw error;
  }

  if (!details || typeof details !== "string") {
    const error = new Error("details is required.");
    error.status = 400;
    throw error;
  }

  return {
    items,
    city: city.trim(),
    details: details.trim(),
  };
}

function requirePaymentPayload(body) {
  const orderId = Number(body && body.order_id);
  const method = body && body.method ? String(body.method) : "card";

  if (!Number.isInteger(orderId) || orderId <= 0) {
    const error = new Error("order_id must be a positive integer.");
    error.status = 400;
    throw error;
  }

  if (method !== "card" && method !== "apple-pay") {
    const error = new Error("method must be either 'card' or 'apple-pay'.");
    error.status = 400;
    throw error;
  }

  return { orderId, method };
}

function parsePagination(query) {
  const rawPage = query && query.page != null ? Number(query.page) : NaN;
  const rawLimit = query && query.limit != null ? Number(query.limit) : NaN;

  let page = Number.isFinite(rawPage) && Number.isInteger(rawPage) ? rawPage : 1;
  let limit = Number.isFinite(rawLimit) && Number.isInteger(rawLimit) ? rawLimit : 10;

  if (page < 1) page = 1;
  if (limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function hasPaginationQuery(query) {
  return Boolean(query && (query.page != null || query.limit != null));
}

module.exports = {
  requireFirebaseToken,
  requireOrderPayload,
  requirePaymentPayload,
  parsePagination,
  hasPaginationQuery,
};
