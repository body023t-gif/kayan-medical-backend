const express = require("express");
const { getCategories } = require("../controllers/commerceController");

const router = express.Router();

router.get("/", getCategories);

module.exports = router;
