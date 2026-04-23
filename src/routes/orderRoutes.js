const express = require("express");
const {
  postOrder,
  getOrderById,
  getUserOrders,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/", postOrder);
router.get("/user", getUserOrders);
router.get("/:id", getOrderById);

module.exports = router;
