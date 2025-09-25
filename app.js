const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const session = require("express-session");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "restaurant-chatbot-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Database connection with better error handling
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/restaurant-chatbot";

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB successfully");

    // Initialize menu data after successful connection
    const { initializeMenu } = require("./utils/menuData");
    initializeMenu()
      .then(() => {
        console.log("Menu data initialized successfully");
      })
      .catch((err) => {
        console.log("Menu initialization skipped (might already exist)");
      });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    console.log("Starting without MongoDB - using in-memory storage");
  });

// Simple in-memory storage fallback
const memoryStorage = {
  users: new Map(),
  orders: new Map(),
  menuItems: new Map(),
};

// Initialize sample menu items in memory
const sampleMenuItems = [
  {
    id: "1",
    name: "Jollof Rice with Chicken",
    description: "Traditional Nigerian jollof rice served with grilled chicken",
    price: 2500,
    category: "Main Course",
  },
  {
    id: "2",
    name: "Pounded Yam with Egusi Soup",
    description: "Soft pounded yam with melon seed soup",
    price: 2200,
    category: "Main Course",
  },
  {
    id: "3",
    name: "Fried Rice with Beef",
    description: "Special fried rice with tender beef pieces",
    price: 2300,
    category: "Main Course",
  },
  {
    id: "4",
    name: "Pepper Soup",
    description: "Spicy assorted meat pepper soup",
    price: 1500,
    category: "Starter",
  },
  {
    id: "5",
    name: "Chapman Drink",
    description: "Refreshing Nigerian cocktail",
    price: 800,
    category: "Drinks",
  },
  {
    id: "6",
    name: "Chocolate Cake",
    description: "Rich chocolate cake slice",
    price: 1200,
    category: "Dessert",
  },
];

sampleMenuItems.forEach((item) => {
  memoryStorage.menuItems.set(item.id, item);
});

// Routes
app.use("/api/chat", require("./routes/chat"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payment", require("./routes/payment"));

// Socket.io
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
});

// Export memory storage for use in other files
app.set("memoryStorage", memoryStorage);
