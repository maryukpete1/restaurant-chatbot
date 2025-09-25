const MenuItem = require("../models/MenuItem");

// Initialize sample menu items
async function initializeMenu() {
  try {
    // Check if menu items already exist
    const existingCount = await MenuItem.countDocuments();
    if (existingCount > 0) {
      console.log("Menu items already exist, skipping initialization");
      return;
    }

    const menuItems = [
      {
        name: "Jollof Rice with Chicken",
        description:
          "Traditional Nigerian jollof rice served with grilled chicken",
        price: 2500,
        category: "Main Course",
      },
      {
        name: "Pounded Yam with Egusi Soup",
        description: "Soft pounded yam with melon seed soup",
        price: 2200,
        category: "Main Course",
      },
      {
        name: "Fried Rice with Beef",
        description: "Special fried rice with tender beef pieces",
        price: 2300,
        category: "Main Course",
      },
      {
        name: "Pepper Soup",
        description: "Spicy assorted meat pepper soup",
        price: 1500,
        category: "Starter",
      },
      {
        name: "Chapman Drink",
        description: "Refreshing Nigerian cocktail",
        price: 800,
        category: "Drinks",
      },
      {
        name: "Chocolate Cake",
        description: "Rich chocolate cake slice",
        price: 1200,
        category: "Dessert",
      },
    ];

    await MenuItem.insertMany(menuItems);
    console.log("Menu items initialized successfully");
  } catch (error) {
    console.error("Error initializing menu:", error);
    throw error;
  }
}

async function getMenuItems() {
  try {
    return await MenuItem.find({ available: true });
  } catch (error) {
    console.error("Error fetching menu items from MongoDB, using fallback");
    // Return sample data if MongoDB fails
    return [
      {
        _id: "1",
        name: "Jollof Rice with Chicken",
        price: 2500,
        category: "Main Course",
      },
      {
        _id: "2",
        name: "Pounded Yam with Egusi Soup",
        price: 2200,
        category: "Main Course",
      },
      {
        _id: "3",
        name: "Fried Rice with Beef",
        price: 2300,
        category: "Main Course",
      },
    ];
  }
}

module.exports = { initializeMenu, getMenuItems };
