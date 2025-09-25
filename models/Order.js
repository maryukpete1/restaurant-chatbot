const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true,
  },
  quantity: {
    type: Number,
    default: 1,
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema({
  userSession: {
    type: String,
    required: true,
  },
  items: [orderItemSchema],
  total: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["pending", "placed", "paid", "cancelled", "scheduled"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "success", "failed"],
    default: "pending",
  },
  paymentReference: String,
  scheduledFor: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  placedAt: Date,
});

orderSchema.pre("save", function (next) {
  this.total = this.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  next();
});

module.exports = mongoose.model("Order", orderSchema);
