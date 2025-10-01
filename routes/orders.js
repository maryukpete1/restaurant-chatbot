const express = require("express");
const router = express.Router();
const Order = require("../models/Order");

// Get current order
router.get("/current/:userId", async (req, res) => {
  try {
    const order = await Order.findOne({
      userSession: req.params.userId,
      status: "pending",
    }).populate("items.menuItem");

    res.json(order || { items: [], total: 0 });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get order history
router.get("/history/:userId", async (req, res) => {
  try {
    const orders = await Order.find({
      userSession: req.params.userId,
      status: { $in: ["placed", "paid"] },
    })
      .populate("items.menuItem")
      .exec();

    // Sort with fallback to createdAt if placedAt missing
    orders.sort((a, b) => {
      const aTime = (a.placedAt || a.createdAt || 0).getTime ? (a.placedAt || a.createdAt).getTime() : 0;
      const bTime = (b.placedAt || b.createdAt || 0).getTime ? (b.placedAt || b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
