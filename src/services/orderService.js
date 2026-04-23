const { get, all, run } = require("../config/database");

async function getProductsByIds(productIds) {
  const placeholders = productIds.map(() => "?").join(", ");
  return all(`SELECT id, name_ar, name_en, price, image FROM products WHERE id IN (${placeholders})`, productIds);
}

function calculateOrderTotals(items, productsMap) {
  let total = 0;
  const resolvedItems = items.map((item) => {
    const product = productsMap.get(item.product_id);
    const quantity = Number(item.quantity);
    const unitPrice = Number(product.price);
    const lineTotal = unitPrice * quantity;
    total += lineTotal;

    return {
      product_id: product.id,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });

  return { resolvedItems, total };
}

async function createOrder({ userId, items, city, details }) {
  const productIds = [...new Set(items.map((item) => Number(item.product_id)))];
  const products = await getProductsByIds(productIds);

  if (products.length !== productIds.length) {
    const foundIds = new Set(products.map((p) => p.id));
    const missing = productIds.filter((id) => !foundIds.has(id));
    const error = new Error(`Products not found: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const productsMap = new Map(products.map((product) => [product.id, product]));
  const { resolvedItems, total } = calculateOrderTotals(items, productsMap);
  if (!Number.isFinite(total) || total <= 0) {
    const error = new Error("Calculated total must be greater than zero.");
    error.status = 400;
    throw error;
  }

  const createdOrder = await run(
    `
      INSERT INTO orders (user_id, total_price, status, currency, city, address_details)
      VALUES (?, ?, 'pending', 'SAR', ?, ?)
    `,
    [userId, total, city, details]
  );

  for (const item of resolvedItems) {
    await run(
      `
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?)
      `,
      [createdOrder.lastID, item.product_id, item.quantity, item.unit_price, item.line_total]
    );
  }

  return getOrderByIdForUser(createdOrder.lastID, userId);
}

async function getOrderItems(orderId) {
  return all(
    `
      SELECT id, order_id, product_id, quantity, unit_price, line_total
      FROM order_items
      WHERE order_id = ?
    `,
    [orderId]
  );
}

async function getOrderByIdForUser(orderId, userId) {
  const order = await get(
    `
      SELECT id, user_id, total_price, status, currency, city, address_details, created_at
      FROM orders
      WHERE id = ? AND user_id = ?
    `,
    [orderId, userId]
  );
  if (!order) return null;

  const items = await getOrderItems(order.id);
  return { ...order, items };
}

async function listOrdersForUser(userId, lang = "en") {
  const suffix = lang === "ar" ? "ar" : "en";
  const rows = await all(
    `
      SELECT
        o.id AS order_id,
        o.status AS status,
        o.total_price AS total_price,
        o.created_at AS created_at,
        oi.product_id AS product_id,
        oi.quantity AS quantity,
        p.name_${suffix} AS product_name,
        COALESCE(p.image_url, p.image) AS product_image,
        p.price AS product_price
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ?
      ORDER BY o.id DESC, oi.id ASC
    `,
    [userId]
  );

  const ordersById = new Map();
  for (const row of rows) {
    if (!ordersById.has(row.order_id)) {
      ordersById.set(row.order_id, {
        id: row.order_id,
        status: row.status,
        total_price: row.total_price,
        created_at: row.created_at,
        items: [],
      });
    }
    if (row.product_id != null) {
      ordersById.get(row.order_id).items.push({
        product_id: row.product_id,
        name: row.product_name,
        image: row.product_image,
        price: Number(Number(row.product_price).toFixed(2)),
        quantity: row.quantity,
      });
    }
  }

  return [...ordersById.values()];
}

async function updateOrderStatus(orderId, status) {
  await run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
}

module.exports = {
  createOrder,
  getOrderByIdForUser,
  listOrdersForUser,
  updateOrderStatus,
};
