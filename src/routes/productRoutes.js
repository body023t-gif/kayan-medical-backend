const express = require("express");
const { getProducts } = require("../controllers/productController");
const { getProductReviews } = require("../controllers/commerceController");

const router = express.Router();

router.get("/:id/reviews", getProductReviews);
router.get("/", getProducts);

module.exports = router;
