const commerceService = require("../services/commerceService");
const { hasPaginationQuery, parsePagination } = require("../services/validators");

function parseLang(req) {
  return req.query.lang === "ar" ? "ar" : "en";
}

async function getCategories(req, res, next) {
  try {
    const categories = await commerceService.listCategories(parseLang(req));
    return res.json({ categories });
  } catch (error) {
    return next(error);
  }
}

async function addFavorite(req, res, next) {
  try {
    const productId = Number(req.body.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      const error = new Error("product_id must be a positive integer.");
      error.status = 400;
      throw error;
    }
    const favorite = await commerceService.addFavorite(req.user.id, productId);
    return res.status(201).json(favorite);
  } catch (error) {
    return next(error);
  }
}

async function deleteFavorite(req, res, next) {
  try {
    const productIdRaw = req.params.product_id ?? req.params.id;
    const productId = Number(productIdRaw);
    if (!Number.isInteger(productId) || productId <= 0) {
      const error = new Error("Invalid product id.");
      error.status = 400;
      throw error;
    }
    const deleted = await commerceService.removeFavoriteByProduct(req.user.id, productId);
    if (!deleted) return res.status(404).send();
    return res.status(200).send();
  } catch (error) {
    return next(error);
  }
}

async function getFavorites(req, res, next) {
  try {
    const lang = parseLang(req);
    if (!hasPaginationQuery(req.query)) {
      const favorites = await commerceService.getFavorites(req.user.id, lang);
      return res.json({ favorites });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { total, rows } = await commerceService.getFavoritesPaged(req.user.id, lang, { limit, offset });
    const pages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    const pagination = { page, limit, total, pages };

    // Backward compatible: keep `favorites` while adding `data` + `pagination`
    return res.json({ favorites: rows, data: rows, pagination });
  } catch (error) {
    return next(error);
  }
}

function parseAddressPayload(body) {
  const city = body && typeof body.city === "string" ? body.city.trim() : "";
  const details = body && typeof body.details === "string" ? body.details.trim() : "";
  if (!city || !details) {
    const error = new Error("city and details are required.");
    error.status = 400;
    throw error;
  }
  return { city, details };
}

async function createAddress(req, res, next) {
  try {
    const payload = parseAddressPayload(req.body);
    const address = await commerceService.createAddress(req.user.id, payload);
    return res.status(201).json(address);
  } catch (error) {
    return next(error);
  }
}

async function getAddresses(req, res, next) {
  try {
    const address = await commerceService.getAddress(req.user.id);
    return res.json({ address: address || null });
  } catch (error) {
    return next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    const payload = parseAddressPayload(req.body);
    const address = await commerceService.updateAddress(req.user.id, payload);
    return res.json(address);
  } catch (error) {
    return next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    await commerceService.deleteAddress(req.user.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const profile = await commerceService.getProfile(req.user.id);
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const name = req.body?.name ? String(req.body.name).trim() : null;
    const profileImage = req.body?.profile_image || null;
    if (!name && !profileImage) {
      const error = new Error("Provide name and/or profile_image.");
      error.status = 400;
      throw error;
    }
    const profile = await commerceService.updateProfile(req.user.id, { name, profileImage });
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}

async function postReview(req, res, next) {
  try {
    const productId = Number(req.body.product_id);
    const rating = Number(req.body.rating);
    const comment = req.body.comment ? String(req.body.comment) : null;
    if (!Number.isInteger(productId) || productId <= 0) {
      const error = new Error("product_id must be a positive integer.");
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const error = new Error("rating must be an integer between 1 and 5.");
      error.status = 400;
      throw error;
    }
    const review = await commerceService.addReview(req.user.id, { productId, rating, comment });
    return res.status(201).json(review);
  } catch (error) {
    if (error && error.status === 403 && error.code === "REVIEW_NOT_PURCHASED") {
      return res.status(403).json({ message: "You can only review products you have purchased." });
    }
    return next(error);
  }
}

async function getProductReviews(req, res, next) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      const error = new Error("Invalid product id.");
      error.status = 400;
      throw error;
    }
    const reviews = await commerceService.getProductReviews(productId);
    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
}

async function createRefund(req, res, next) {
  try {
    const orderId = Number(req.body.order_id);
    const reason = req.body.reason ? String(req.body.reason).trim() : "";
    const imageData = req.body.image || null;
    if (!Number.isInteger(orderId) || orderId <= 0) {
      const error = new Error("order_id must be a positive integer.");
      error.status = 400;
      throw error;
    }
    if (!reason) {
      const error = new Error("reason is required.");
      error.status = 400;
      throw error;
    }
    const refund = await commerceService.createRefund(req.user.id, { orderId, reason, imageData });
    return res.status(201).json(refund);
  } catch (error) {
    if (error && error.status === 403 && error.code === "REFUND_UNAUTHORIZED") {
      return res.status(403).json({ message: "Unauthorized refund request." });
    }
    return next(error);
  }
}

async function validateCoupon(req, res, next) {
  try {
    const code = req.body?.code;
    if (!code || typeof code !== "string") {
      const error = new Error("code is required.");
      error.status = 400;
      throw error;
    }
    const orderTotal = Number(req.body?.order_total);
    if (!Number.isFinite(orderTotal) || orderTotal < 0) {
      const error = new Error("order_total must be a non-negative number.");
      error.status = 400;
      throw error;
    }
    const coupon = await commerceService.validateCoupon(code, orderTotal);
    return res.json({ valid: true, coupon });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCategories,
  addFavorite,
  deleteFavorite,
  getFavorites,
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  getProfile,
  updateProfile,
  postReview,
  getProductReviews,
  createRefund,
  validateCoupon,
};
