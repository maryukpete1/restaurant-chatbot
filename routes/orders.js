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
      .sort({ placedAt: -1 })
      .populate("items.menuItem");

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
