const express = require("express");
const controller = require("../controllers/shippingController");

const router = express.Router();

router.post("/", controller.upsertShippingRule);
router.get("/", controller.getShippingRules);

module.exports = router;
