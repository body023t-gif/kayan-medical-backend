const express = require("express");
const { addFavorite, deleteFavorite, getFavorites } = require("../controllers/commerceController");

const router = express.Router();

router.post("/", addFavorite);
router.delete("/:product_id", deleteFavorite);
router.get("/", getFavorites);

module.exports = router;
