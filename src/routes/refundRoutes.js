const express = require("express");
const { createRefund } = require("../controllers/commerceController");

const router = express.Router();

router.post("/", createRefund);

module.exports = router;
