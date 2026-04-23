const { all, get, run } = require("../config/database");
const { uploadImage } = require("./cloudinaryService");

function resolveLang(lang) {
  return lang === "ar" ? "ar" : "en";
}

function mapLocalizedRow(row, lang, type) {
  const suffix = resolveLang(lang);
  if (type === "category") {
    return {
      id: row.id,
      name: row[`name_${suffix}`],
      image_url: row.image_url,
    };
  }
  return {
    id: row.id,
    name: row[`name_${suffix}`],
    description: row[`description_${suffix}`],
    price: row.price,
    image_url: row.image_url || row.image,
    category_id: row.category_id,
  };
}

async function listCategories(lang) {
  const rows = await all("SELECT id, name_ar, name_en, image_url FROM categories ORDER BY id ASC");
  return rows.map((row) => mapLocalizedRow(row, lang, "category"));
}

async function listProducts(lang) {
  const rows = await all(
    "SELECT id, name_ar, name_en, description_ar, description_en, price, image, image_url, category_id FROM products ORDER BY id ASC"
  );
  return rows.map((row) => mapLocalizedRow(row, lang, "product"));
}

async function addFavorite(userId, productId) {
  const product = await get("SELECT id FROM products WHERE id = ?", [productId]);
  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }
  try {
    const result = await run("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)", [userId, productId]);
    return get("SELECT id, user_id, product_id, created_at FROM favorites WHERE id = ?", [result.lastID]);
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      const duplicateError = new Error("Favorite already exists.");
      duplicateError.status = 409;
      throw duplicateError;
    }
    throw error;
  }
}

async function removeFavorite(userId, favoriteId) {
  const favorite = await get("SELECT id FROM favorites WHERE id = ? AND user_id = ?", [favoriteId, userId]);
  if (!favorite) {
    const error = new Error("Favorite not found.");
    error.status = 404;
    throw error;
  }
  await run("DELETE FROM favorites WHERE id = ?", [favoriteId]);
}

async function removeFavoriteByProduct(userId, productId) {
  const favorite = await get("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?", [userId, productId]);
  if (!favorite) return false;
  await run("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", [userId, productId]);
  return true;
}

async function getFavorites(userId, lang) {
  const rows = await all(
    `
      SELECT f.id AS favorite_id, p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.price, p.image, p.image_url, p.category_id
      FROM favorites f
      JOIN products p ON p.id = f.product_id
      WHERE f.user_id = ?
      ORDER BY f.id DESC
    `,
    [userId]
  );
  return rows.map((row) => ({
    favorite_id: row.favorite_id,
    product: mapLocalizedRow(row, lang, "product"),
  }));
}

async function getFavoritesPaged(userId, lang, { limit, offset }) {
  const countRow = await get("SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?", [userId]);
  const total = Number(countRow?.total || 0);

  const rows = await all(
    `
      SELECT f.id AS favorite_id, p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.price, p.image, p.image_url, p.category_id
      FROM favorites f
      JOIN products p ON p.id = f.product_id
      WHERE f.user_id = ?
      ORDER BY f.id DESC
      LIMIT ? OFFSET ?
    `,
    [userId, limit, offset]
  );

  return {
    total,
    rows: rows.map((row) => ({
      favorite_id: row.favorite_id,
      product: mapLocalizedRow(row, lang, "product"),
    })),
  };
}

async function getAddress(userId) {
  return get(
    `
      SELECT id, user_id, city, details, created_at
      FROM addresses
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [userId]
  );
}

async function createAddress(userId, { city, details }) {
  const existing = await getAddress(userId);
  if (existing) {
    await run("UPDATE addresses SET city = ?, details = ? WHERE id = ? AND user_id = ?", [city, details, existing.id, userId]);
    return getAddress(userId);
  }
  const result = await run("INSERT INTO addresses (user_id, city, details) VALUES (?, ?, ?)", [userId, city, details]);
  return get("SELECT id, user_id, city, details, created_at FROM addresses WHERE id = ?", [result.lastID]);
}

async function updateAddress(userId, { city, details }) {
  const existing = await getAddress(userId);
  if (!existing) {
    const error = new Error("Address not found.");
    error.status = 404;
    throw error;
  }
  await run("UPDATE addresses SET city = ?, details = ? WHERE id = ? AND user_id = ?", [city, details, existing.id, userId]);
  return getAddress(userId);
}

async function deleteAddress(userId) {
  const existing = await getAddress(userId);
  if (!existing) {
    const error = new Error("Address not found.");
    error.status = 404;
    throw error;
  }
  await run("DELETE FROM addresses WHERE id = ? AND user_id = ?", [existing.id, userId]);
}

async function getProfile(userId) {
  return get("SELECT id, firebase_uid, phone, name, profile_image_url, created_at FROM users WHERE id = ?", [userId]);
}

async function updateProfile(userId, { name, profileImage }) {
  const imageUrl = profileImage ? await uploadImage(profileImage, "mobile-backend/profile") : null;
  await run(
    "UPDATE users SET name = COALESCE(?, name), profile_image_url = COALESCE(?, profile_image_url) WHERE id = ?",
    [name || null, imageUrl, userId]
  );
  return getProfile(userId);
}

async function userPurchasedProduct(userId, productId) {
  const row = await get(
    `
      SELECT oi.id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'paid'
      LIMIT 1
    `,
    [userId, productId]
  );
  return Boolean(row);
}

async function addReview(userId, { productId, rating, comment }) {
  const product = await get("SELECT id FROM products WHERE id = ?", [productId]);
  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }
  const purchased = await userPurchasedProduct(userId, productId);
  if (!purchased) {
    const error = new Error("You can only review products you have purchased.");
    error.status = 403;
    error.code = "REVIEW_NOT_PURCHASED";
    throw error;
  }
  try {
    const result = await run("INSERT INTO reviews (user_id, product_id, rating, comment) VALUES (?, ?, ?, ?)", [
      userId,
      productId,
      rating,
      comment || null,
    ]);
    return get(
      `
      SELECT r.id, r.user_id, r.product_id, r.rating, r.comment, r.created_at, u.name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = ?
      `,
      [result.lastID]
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      const duplicateError = new Error("You already reviewed this product.");
      duplicateError.status = 409;
      throw duplicateError;
    }
    throw error;
  }
}

async function getProductReviews(productId) {
  return all(
    `
      SELECT r.id, r.user_id, r.product_id, r.rating, r.comment, r.created_at, u.name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ?
      ORDER BY r.id DESC
    `,
    [productId]
  );
}

async function createRefund(userId, { orderId, reason, imageData }) {
  const order = await get("SELECT id, user_id FROM orders WHERE id = ?", [orderId]);
  if (!order) {
    const error = new Error("Order not found.");
    error.status = 404;
    throw error;
  }
  if (order.user_id !== userId) {
    const error = new Error("Unauthorized refund request.");
    error.status = 403;
    error.code = "REFUND_UNAUTHORIZED";
    throw error;
  }
  const existing = await get("SELECT id FROM refunds WHERE order_id = ? LIMIT 1", [orderId]);
  if (existing) {
    const error = new Error("Refund already requested for this order.");
    error.status = 409;
    throw error;
  }
  const imageUrl = imageData ? await uploadImage(imageData, "mobile-backend/refunds") : null;
  const result = await run("INSERT INTO refunds (order_id, reason, image_url, status) VALUES (?, ?, ?, 'pending')", [
    orderId,
    reason,
    imageUrl,
  ]);
  return get("SELECT id, order_id, reason, image_url, status, created_at FROM refunds WHERE id = ?", [result.lastID]);
}

async function validateCoupon(code, orderTotal) {
  const coupon = await get("SELECT * FROM coupons WHERE code = ?", [String(code || "").trim().toUpperCase()]);
  if (!coupon) {
    const error = new Error("Coupon not found.");
    error.status = 404;
    throw error;
  }
  const now = Date.now();
  const expiry = new Date(coupon.expires_at).getTime();
  if (!Number.isFinite(expiry) || expiry < now) {
    const error = new Error("Coupon expired.");
    error.status = 400;
    throw error;
  }
  if (coupon.used_count >= coupon.max_usage) {
    const error = new Error("Coupon usage limit reached.");
    error.status = 400;
    throw error;
  }
  const minOrderAmount = Number(coupon.min_order_amount || 0);
  if (Number.isFinite(minOrderAmount) && orderTotal < minOrderAmount) {
    const error = new Error(`Minimum order amount for this coupon is ${minOrderAmount}.`);
    error.status = 400;
    throw error;
  }
  return {
    id: coupon.id,
    code: coupon.code,
    discount_percentage: coupon.discount_percentage,
    expires_at: coupon.expires_at,
    remaining_usage: coupon.max_usage - coupon.used_count,
  };
}

module.exports = {
  listCategories,
  listProducts,
  addFavorite,
  removeFavorite,
  removeFavoriteByProduct,
  getFavorites,
  getFavoritesPaged,
  createAddress,
  updateAddress,
  deleteAddress,
  getAddress,
  getProfile,
  updateProfile,
  addReview,
  getProductReviews,
  createRefund,
  validateCoupon,
};
