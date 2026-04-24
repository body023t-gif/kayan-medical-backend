const express = require("express");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const addressRoutes = require("./routes/addressRoutes");
const profileRoutes = require("./routes/profileRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const refundRoutes = require("./routes/refundRoutes");
const couponRoutes = require("./routes/couponRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const authMiddleware = require("./middlewares/authMiddleware");
const errorMiddleware = require("./middlewares/errorMiddleware");
const rateLimiter = require("./middlewares/rateLimiter");
const { logStep } = require("./utils/logger");

const app = express();

app.use(express.json());
app.use((req, _res, next) => {
  logStep("REQUEST", {
    method: req.method,
    url: req.originalUrl || req.url,
    bodySnapshot: req.body,
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({ service: "mobile-backend", status: "ok" });
});

app.use("/auth", rateLimiter, authRoutes);
app.use("/products", productRoutes);
app.use("/categories", categoryRoutes);
app.use("/orders", rateLimiter, authMiddleware, orderRoutes);
app.use("/payments", rateLimiter, authMiddleware, paymentRoutes);
app.use("/favorites", rateLimiter, authMiddleware, favoriteRoutes);
app.use("/address", rateLimiter, authMiddleware, addressRoutes);
app.use("/profile", rateLimiter, authMiddleware, profileRoutes);
app.use("/reviews", rateLimiter, authMiddleware, reviewRoutes);
app.use("/refunds", rateLimiter, authMiddleware, refundRoutes);
app.use("/coupons", rateLimiter, authMiddleware, couponRoutes);
app.use("/shipping", rateLimiter, authMiddleware, shippingRoutes);

app.use((_req, _res, next) => {
  const error = new Error("Route not found.");
  error.status = 404;
  next(error);
});

app.use(errorMiddleware);

module.exports = app;
