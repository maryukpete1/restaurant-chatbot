const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const MenuItem = require("../models/MenuItem");
const { getMenuItems } = require("../utils/menuData");

// Initialize or get user session
async function getUserSession(sessionId) {
  let user = await User.findOne({ sessionId }).populate("currentOrder");

  if (!user) {
    user = new User({ sessionId });
    await user.save();
  }

  return user;
}

function getItemDisplayName(item) {
  // Try different possible locations for the name
  if (item.menuItem && item.menuItem.name) {
    return item.menuItem.name;
  }
  if (item.name) {
    return item.name;
  }
  if (item.menuItem && typeof item.menuItem === "string") {
    return "Menu Item"; // This is just an ID, we'll handle it differently
  }
  return "Menu Item";
}

// Main chat message handler
router.post("/message", async (req, res) => {
  try {
    const { userId, message } = req.body;
    const user = await getUserSession(userId);

    let response = { message: "", options: [] };

    switch (message) {
      case "1":
        response = await handlePlaceOrder(user);
        break;
      case "99":
        response = await handleCheckout(user);
        break;
      case "98":
        response = await handleOrderHistory(user);
        break;
      case "97":
        response = await handleCurrentOrder(user);
        break;
      case "0":
        response = await handleCancelOrder(user);
        break;
      case "pay":
        response = await handlePayment(user);
        break;
      case "back":
        response = await handleBackToMain();
        break;
      default:
        if (message.startsWith("add_")) {
          response = await handleAddItem(user, message.replace("add_", ""));
        } else if (message.startsWith("category_")) {
          response = await handleCategory(
            user,
            message.replace("category_", "")
          );
        } else {
          response.message = "Invalid option. Please select from the menu.";
          response.options = getMainOptions();
        }
    }

    res.json(response);
  } catch (error) {
    console.error("Chat error:", error);
    res
      .status(500)
      .json({ message: "Server error", options: getMainOptions() });
  }
});

async function handlePlaceOrder(user) {
  const categories = await MenuItem.distinct("category");

  const categoryOptions = categories.map((category) => ({
    value: `category_${category}`,
    text: `Browse ${category}`,
  }));

  return {
    message: "Please select a category to browse menu items:",
    options: [
      ...categoryOptions,
      { value: "back", text: "← Back to Main Menu" },
    ],
  };
}

async function handleCategory(user, category) {
  const menuItems = await MenuItem.find({ available: true, category });

  const menuOptions = menuItems.map((item) => ({
    value: `add_${item._id}`,
    text: `${item.name} - ₦${item.price}`,
  }));

  return {
    message: `**${category} Menu:**\nPlease select items to add to your order:`,
    options: [
      ...menuOptions,
      { value: "1", text: "← Back to Categories" },
      { value: "back", text: "← Back to Main Menu" },
    ],
  };
}

async function handleAddItem(user, itemId) {
  let order = await Order.findById(user.currentOrder);

  if (!order || order.status !== "pending") {
    order = new Order({ userSession: user.sessionId, items: [] });
    await order.save();
    user.currentOrder = order._id;
    await user.save();
  }

  const menuItem = await MenuItem.findById(itemId);
  if (!menuItem) {
    return { message: "Item not found.", options: getMainOptions() };
  }

  const existingItem = order.items.find(
    (item) => item.menuItem.toString() === itemId
  );
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    order.items.push({
      menuItem: itemId,
      price: menuItem.price,
      quantity: 1,
    });
  }

  await order.save();

  const currentOrder = await Order.findById(user.currentOrder).populate(
    "items.menuItem"
  );

  return {
    message: `✅ Added **${menuItem.name}** to your order!`,
    options: [
      { value: "1", text: "➕ Add More Items" },
      { value: "97", text: "📋 View Current Order" },
      { value: "99", text: "💰 Checkout" },
      { value: "back", text: "← Main Menu" },
    ],
    order: currentOrder
      ? {
          items: currentOrder.items.map((item) => ({
            name: item.menuItem.name,
            price: item.price,
            quantity: item.quantity,
          })),
          total: currentOrder.total,
        }
      : null,
  };
}

async function handleCheckout(user) {
  // Ensure we properly populate the menuItem references
  const order = await Order.findById(user.currentOrder)
    .populate("items.menuItem")
    .exec();

  if (!order || order.items.length === 0) {
    return {
      message: "❌ No order to place. Please add items first.",
      options: [
        { value: "1", text: "🛍️ Start Ordering" },
        { value: "back", text: "← Main Menu" },
      ],
    };
  }

  // Fix: Use the helper function to get item names
  const orderSummary = order.items
    .map((item) => {
      const itemName = getItemDisplayName(item);
      return `• ${item.quantity}x ${itemName} - ₦${item.price * item.quantity}`;
    })
    .join("\n");

  return {
    message: `📋 **Order Summary:**\n${orderSummary}\n\n💰 **Total: ₦${order.total}**\n\nWould you like to proceed to payment?`,
    options: [
      {
        value: "pay",
        text: "💳 Proceed to Payment",
        action: "initiate_payment",
      },
      { value: "1", text: "🛍️ Add More Items" },
      { value: "0", text: "❌ Cancel Order" },
      { value: "back", text: "← Main Menu" },
    ],
    order: {
      items: order.items.map((item) => ({
        name: getItemDisplayName(item),
        price: item.price,
        quantity: item.quantity,
      })),
      total: order.total,
    },
  };
}

async function handlePayment(user) {
  const order = await Order.findById(user.currentOrder).populate(
    "items.menuItem"
  );

  if (!order || order.items.length === 0) {
    return {
      message: "No order to pay for. Please place an order first.",
      options: getMainOptions(),
    };
  }

  // Fix: Provide proper payment information instead of just a URL
  return {
    message: `💳 **Payment Processing**\n\nOrder Total: ₦${order.total}\n\nClick the payment button below to complete your order. A new window will open for payment processing.`,
    options: [
      {
        value: "initiate_payment",
        text: "💳 Pay with Paystack",
        action: "initiate_payment",
      },
      { value: "97", text: "📋 View Order" },
      { value: "0", text: "❌ Cancel Order" },
      { value: "back", text: "← Main Menu" },
    ],
    order: {
      items: order.items.map((item) => ({
        name: item.menuItem ? item.menuItem.name : "Menu Item",
        price: item.price,
        quantity: item.quantity,
      })),
      total: order.total,
    },
  };
}

async function handleOrderHistory(user) {
  const orders = await Order.find({
    userSession: user.sessionId,
    status: { $in: ["placed", "paid"] },
  })
    .sort({ placedAt: -1 })
    .populate("items.menuItem");

  if (orders.length === 0) {
    return {
      message: "📊 No order history found.",
      options: [
        { value: "1", text: "🛍️ Place New Order" },
        { value: "back", text: "← Main Menu" },
      ],
    };
  }

  function formatOrderDate(order) {
    const date = order.placedAt || order.paidAt || order.createdAt;
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString();
    } catch (_) {
      return "N/A";
    }
  }

  const historyText = orders
    .map(
      (order, index) =>
        `**Order ${index + 1}:**\n• ${order.items.length} items\n• Total: ₦${
          order.total
        }\n• Status: ${
          order.status
        }\n• Date: ${formatOrderDate(order)}\n`
    )
    .join("\n");

  return {
    message: `📊 **Your Order History:**\n\n${historyText}`,
    options: [
      { value: "1", text: "🛍️ Place New Order" },
      { value: "back", text: "← Main Menu" },
    ],
  };
}

async function handleCurrentOrder(user) {
  const order = await Order.findById(user.currentOrder)
    .populate("items.menuItem")
    .exec();

  if (!order || order.items.length === 0) {
    return {
      message: "📋 No current order. Please place an order first.",
      options: [
        { value: "1", text: "🛍️ Start Ordering" },
        { value: "back", text: "← Main Menu" },
      ],
    };
  }

  const orderText = order.items
    .map((item) => {
      const itemName = getItemDisplayName(item);
      return `• ${item.quantity}x ${itemName} - ₦${item.price * item.quantity}`;
    })
    .join("\n");

  return {
    message: `📋 **Current Order:**\n${orderText}\n\n💰 **Total: ₦${order.total}**`,
    options: [
      { value: "1", text: "➕ Add More Items" },
      { value: "99", text: "💰 Checkout" },
      { value: "0", text: "❌ Cancel Order" },
      { value: "back", text: "← Main Menu" },
    ],
    order: {
      items: order.items.map((item) => ({
        name: getItemDisplayName(item),
        price: item.price,
        quantity: item.quantity,
      })),
      total: order.total,
    },
  };
}

async function handleCancelOrder(user) {
  const order = await Order.findById(user.currentOrder);

  if (order) {
    order.status = "cancelled";
    await order.save();
    user.currentOrder = null;
    await user.save();

    return {
      message: "❌ Order cancelled successfully.",
      options: [
        { value: "1", text: "🛍️ Start New Order" },
        { value: "back", text: "← Main Menu" },
      ],
    };
  }

  return {
    message: "❌ No order to cancel.",
    options: getMainOptions(),
  };
}

async function handleBackToMain() {
  return {
    message: "🏠 **Main Menu**\nWelcome back! How can I help you today?",
    options: getMainOptions(),
  };
}

function getMainOptions() {
  return [
    { value: "1", text: "🛍️ Place an order" },
    { value: "99", text: "💰 Checkout order" },
    { value: "98", text: "📊 Order history" },
    { value: "97", text: "📋 Current order" },
    { value: "0", text: "❌ Cancel order" },
  ];
}

module.exports = router;
