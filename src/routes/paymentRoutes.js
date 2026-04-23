const express = require("express");
const { payOrder } = require("../controllers/paymentController");

const router = express.Router();

router.post("/pay", payOrder);

module.exports = router;
