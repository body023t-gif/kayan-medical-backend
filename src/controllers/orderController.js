const {
  createOrder,
  getOrderByIdForUser,
  listOrdersForUser,
} = require("../services/orderService");
const { requireOrderPayload } = require("../services/validators");

async function postOrder(req, res, next) {
  try {
    const payload = requireOrderPayload(req.body);
    const order = await createOrder({
      userId: req.user.id,
      ...payload,
    });

    console.log("[ORDER] Created order", {
      order_id: order.id,
      user_id: req.user.id,
      item_count: order.items.length,
      total_price: order.total_price,
    });

    return res.status(201).json(order);
  } catch (error) {
    return next(error);
  }
}

async function getOrderById(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      const error = new Error("Invalid order id.");
      error.status = 400;
      throw error;
    }

    const order = await getOrderByIdForUser(orderId, req.user.id);
    if (!order) {
      const error = new Error("Order not found.");
      error.status = 404;
      throw error;
    }

    return res.json(order);
  } catch (error) {
    return next(error);
  }
}

async function getUserOrders(req, res, next) {
  try {
    const lang = req.query.lang === "ar" ? "ar" : "en";
    const orders = await listOrdersForUser(req.user.id, lang);
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  postOrder,
  getOrderById,
  getUserOrders,
};
