const {
  getOrderByIdForUser,
  updateOrderStatus,
} = require("../services/orderService");
const {
  callPaymob,
  isSuccessResponse,
  isNetworkOrTimeoutError,
} = require("../services/paymentService");
const { requirePaymentPayload } = require("../services/validators");

const processingOrders = new Set();

async function payOrder(req, res, next) {
  try {
    const { orderId, method } = requirePaymentPayload(req.body);
    const order = await getOrderByIdForUser(orderId, req.user.id);

    if (!order) {
      const error = new Error("Order not found.");
      error.status = 404;
      throw error;
    }

    if (order.status === "paid") {
      return res.status(400).json({
        error: "Order already paid",
      });
    }

    console.log("🔁 Payment attempt:", order.id);
    console.log("📊 Order status before:", order.status);

    if (processingOrders.has(order.id)) {
      return res.status(429).json({
        error: "Payment already in progress",
      });
    }
    processingOrders.add(order.id);

    const requestPayload = {
      amount: Number(order.total_price),
      billing: {
        first_name: "NA",
        last_name: "NA",
        email: "NA",
        phone_number: req.user.phone,
        city: order.city,
        street: order.address_details,
        country: "SA",
      },
    };

    console.log("[PAYMENT] Request start", { order_id: order.id, method });

    try {
      const paymobResponse = await callPaymob({
        method,
        payload: requestPayload,
      });

      const responseData = paymobResponse.data;
      const success = isSuccessResponse(responseData);

      if (success) {
        await updateOrderStatus(order.id, "paid");
      } else {
        await updateOrderStatus(order.id, "failed");
      }

      console.log("[PAYMENT] Response received", {
        order_id: order.id,
        method,
        upstream_status: paymobResponse.status,
        local_status: success ? "paid" : "failed",
      });

      return res.status(paymobResponse.status).json(responseData);
    } catch (error) {
      if (isNetworkOrTimeoutError(error)) {
        console.log("[PAYMENT] Network/timeout error, keep pending", {
          order_id: order.id,
          method,
          reason: error.message,
        });
        return res.status(502).json({
          success: false,
          message: "Payment service temporarily unavailable. Order remains pending.",
          details: error.message,
        });
      }

      await updateOrderStatus(order.id, "failed");
      console.log("[PAYMENT] Failed business response", {
        order_id: order.id,
        method,
        upstream_status: error.response?.status,
      });

      return res.status(error.response.status || 400).json(error.response.data || {
        success: false,
        message: "Payment failed.",
      });
    } finally {
      processingOrders.delete(order.id);
    }
  } catch (error) {
    return next(error);
  }
}

module.exports = { payOrder };
