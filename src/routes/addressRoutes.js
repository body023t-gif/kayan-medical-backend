const express = require("express");
const {
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
} = require("../controllers/commerceController");

const router = express.Router();

router.post("/", createAddress);
router.get("/", getAddresses);
router.put("/", updateAddress);
router.put("/:id", updateAddress);
router.delete("/", deleteAddress);
router.delete("/:id", deleteAddress);

module.exports = router;
