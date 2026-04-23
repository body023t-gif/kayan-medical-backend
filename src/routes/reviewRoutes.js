const express = require("express");
const { postReview } = require("../controllers/commerceController");

const router = express.Router();

router.post("/", postReview);

module.exports = router;
