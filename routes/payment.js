const express = require("express");
const router = express.Router();
const axios = require("axios");
const Order = require("../models/Order");
require("dotenv").config(); // Load environment variables

// Initialize payment with REAL Paystack
router.post("/initialize", async (req, res) => {
  try {
    const { userId } = req.body;
    console.log("Payment initialization requested for user:", userId);

    // Check if Paystack keys are configured
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;

    console.log("Paystack Secret Key exists:", !!paystackSecretKey);
    console.log("Paystack Public Key exists:", !!paystackPublicKey);

    // Find the most recent placed order for this user
    const order = await Order.findOne({
      userSession: userId,
      status: "pending",
    }).populate("items.menuItem");

    if (!order) {
      console.log("No pending order found for user:", userId);
      return res.status(400).json({
        status: false,
        message: "No order to pay for. Please place an order first.",
      });
    }

    console.log("Order found:", order._id, "Total:", order.total);

    // If Paystack keys are configured, use REAL Paystack
    if (paystackSecretKey && paystackPublicKey) {
      console.log("Using REAL Paystack integration");

      const paymentData = {
        email: `customer${userId}@restaurant.com`, // Required by Paystack
        amount: order.total * 100, // Paystack expects amount in kobo
        reference: `order_${order._id}_${Date.now()}`,
        callback_url: `${getBaseUrl(req)}/api/payment/verify`,
        metadata: {
          userId: userId,
          orderId: order._id.toString(),
          custom_fields: [
            {
              display_name: "Order Items",
              variable_name: "order_items",
              value: order.items
                .map(
                  (item) => `${item.quantity}x ${item.menuItem?.name || "Item"}`
                )
                .join(", "),
            },
          ],
        },
      };

      console.log("Sending request to Paystack API...");

      try {
        // Make REAL API call to Paystack
        const response = await axios.post(
          "https://api.paystack.co/transaction/initialize",
          paymentData,
          {
            headers: {
              Authorization: `Bearer ${paystackSecretKey}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          }
        );

        const paystackResponse = response.data;

        if (paystackResponse.status && paystackResponse.data) {
          // Update order with payment reference
          order.paymentReference = paymentData.reference;
          await order.save();

          console.log(
            "Real Paystack payment initialized successfully:",
            paystackResponse.data.reference
          );

          return res.json({
            status: true,
            message: "Paystack payment initialized successfully",
            data: paystackResponse.data,
          });
        } else {
          throw new Error(
            paystackResponse.message || "Paystack initialization failed"
          );
        }
      } catch (paystackError) {
        console.error(
          "Paystack API error:",
          paystackError.response?.data || paystackError.message
        );
        // Fall back to demo mode if Paystack fails
        console.log("Falling back to demo mode due to Paystack error");
      }
    }

    // If we get here, either no Paystack keys or Paystack failed - use DEMO mode
    console.log("Using DEMO payment mode");
    const paymentData = {
      status: true,
      message: "Demo payment initialized successfully",
      data: {
        authorization_url: `${getBaseUrl(
          req
        )}/api/payment/demo?userId=${userId}&orderId=${order._id}&amount=${
          order.total
        }`,
        reference: `demo_${order._id}_${Date.now()}`,
        amount: order.total,
      },
    };

    // Update order with payment reference
    order.paymentReference = paymentData.data.reference;
    await order.save();

    console.log(
      "Demo payment initialized successfully:",
      paymentData.data.reference
    );
    res.json(paymentData);
  } catch (error) {
    console.error("Payment initialization error:", error);
    res.status(500).json({
      status: false,
      message: "Payment initialization failed. Please try again.",
    });
  }
});

// Paystack verification endpoint
router.get("/verify", async (req, res) => {
  try {
    const { reference } = req.query;
    console.log("Payment verification requested for reference:", reference);

    if (!reference) {
      return res.status(400).json({
        status: false,
        message: "No reference provided",
      });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

    // If it's a demo reference, handle differently
    if (reference.startsWith("demo_")) {
      console.log("Verifying DEMO payment");

      const order = await Order.findOne({ paymentReference: reference });
      if (!order) {
        return res
          .status(404)
          .json({ status: false, message: "Order not found" });
      }

      // For demo, we need to check if it was successful (this is a simplification)
      // In real implementation, you'd have a way to track demo payment status
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>Demo Payment Verification</h1>
            <p>Reference: ${reference}</p>
            <p>Demo payments need to be verified through the chat interface.</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }

    // REAL Paystack verification
    if (paystackSecretKey) {
      console.log("Verifying REAL Paystack payment");

      const verificationResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
          },
        }
      );

      const verificationData = verificationResponse.data;

      if (
        verificationData.status &&
        verificationData.data.status === "success"
      ) {
        const transaction = verificationData.data;

        const order = await Order.findOne({ paymentReference: reference });
        if (order) {
          order.status = "paid";
          order.paymentStatus = "success";
          order.paidAt = new Date();
          await order.save();

          console.log("Real Paystack payment verified successfully");

          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Successful - Restaurant ChatBot</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                        color: white;
                    }
                    .success-container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                </style>
            </head>
            <body>
                <div class="success-container">
                    <div style="font-size: 4em; color: #4CAF50;">✅</div>
                    <h1>Payment Successful!</h1>
                    <p><strong>Reference:</strong> ${transaction.reference}</p>
                    <p><strong>Amount:</strong> ₦${transaction.amount / 100}</p>
                    <p>Thank you for your order! Your payment has been processed successfully.</p>
                    <button onclick="closeAndNotify()" style="
                        padding: 12px 30px; 
                        background: #4CAF50; 
                        color: white; 
                        border: none; 
                        border-radius: 8px; 
                        cursor: pointer;">
                        Close Window
                    </button>
                </div>
                <script>
                    function closeAndNotify() {
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'payment_complete',
                                status: 'success',
                                reference: '${reference}'
                            }, '*');
                        }
                        window.close();
                    }
                    setTimeout(closeAndNotify, 5000);
                </script>
            </body>
            </html>
          `);
        }
      }
    }

    // If we get here, verification failed
    res.status(400).send("Payment verification failed");
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).send("Payment verification failed");
  }
});

router.get("/initialize", async (req, res) => {
  // Redirect to POST or show instructions
  res.json({
    error: "Please use POST method for payment initialization",
    instruction:
      "This endpoint should be called via POST request from the chat interface",
  });
});

// Demo payment page
router.get("/demo", async (req, res) => {
  try {
    const { userId, orderId, amount } = req.query;

    const order = await Order.findById(orderId).populate("items.menuItem");
    if (!order) {
      return res.status(404).send("Order not found");
    }

    res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Demo - Restaurant ChatBot</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 500px; 
                        margin: 50px auto; 
                        padding: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                    }
                    .payment-container { 
                        background: white; 
                        padding: 30px; 
                        border-radius: 15px; 
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    }
                    .success { color: #4CAF50; font-weight: bold; }
                    .failed { color: #f44336; font-weight: bold; }
                    button { 
                        padding: 12px 24px; 
                        margin: 10px 5px; 
                        border: none; 
                        border-radius: 8px; 
                        cursor: pointer;
                        font-size: 16px;
                        transition: all 0.3s;
                    }
                    .success-btn { 
                        background: #4CAF50; 
                        color: white; 
                    }
                    .success-btn:hover { background: #45a049; }
                    .fail-btn { 
                        background: #f44336; 
                        color: white; 
                    }
                    .fail-btn:hover { background: #da190b; }
                    .back-btn { 
                        background: #2196F3; 
                        color: white; 
                        width: 100%;
                        margin-top: 20px;
                    }
                    .back-btn:hover { background: #0b7dda; }
                    .order-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 0;
                        border-bottom: 1px solid #eee;
                    }
                    .order-total {
                        font-size: 1.2em;
                        font-weight: bold;
                        color: #4CAF50;
                        margin-top: 15px;
                        padding-top: 15px;
                        border-top: 2px solid #4CAF50;
                    }
                </style>
            </head>
            <body>
                <div class="payment-container">
                    <h1 style="text-align: center; color: #333;">💳 Payment Demo</h1>
                    <h3 style="color: #666;">Order Summary:</h3>
                    
                    <div style="margin: 20px 0;">
                        ${order.items
                          .map(
                            (item) => `
                            <div class="order-item">
                                <span>${item.quantity}x ${
                              item.menuItem?.name || "Item"
                            }</span>
                                <span>₦${item.price * item.quantity}</span>
                            </div>
                        `
                          )
                          .join("")}
                        
                        <div class="order-total">
                            <span>Total Amount:</span>
                            <span>₦${order.total}</span>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <p><strong>Select payment outcome:</strong></p>
                        <button class="success-btn" onclick="completePayment('success')">
                            ✅ Simulate Successful Payment
                        </button>
                        <button class="fail-btn" onclick="completePayment('failed')">
                            ❌ Simulate Failed Payment
                        </button>
                    </div>
                    
                    <div id="statusMessage" style="text-align: center; margin: 20px 0; min-height: 40px;"></div>
                    
                    <button class="back-btn" onclick="closeWindow()">Close Window</button>
                </div>

                <script>
                    function completePayment(status) {
                        const statusEl = document.getElementById('statusMessage');
                        
                        if (status === 'success') {
                            statusEl.innerHTML = '<div class="success">✅ Payment Successful! Processing...</div>';
                            
                            // Notify the main window
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'payment_complete',
                                    status: 'success',
                                    orderId: '${orderId}',
                                    userId: '${userId}',
                                    amount: ${order.total}
                                }, '*');
                            }
                        } else {
                            statusEl.innerHTML = '<div class="failed">❌ Payment Failed!</div>';
                            
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'payment_complete',
                                    status: 'failed',
                                    orderId: '${orderId}',
                                    userId: '${userId}'
                                }, '*');
                            }
                        }
                        
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    }
                    
                    function closeWindow() {
                        window.close();
                    }
                    
                    // Auto-close after 30 seconds if no action
                    setTimeout(() => {
                        if (document.getElementById('statusMessage').innerHTML === '') {
                            window.close();
                        }
                    }, 30000);
                </script>
            </body>
            </html>
        `);
  } catch (error) {
    console.error("Demo payment error:", error);
    res.status(500).send("Error loading payment page");
  }
});

// Payment verification endpoint
router.post("/verify", async (req, res) => {
  try {
    const { reference, userId } = req.body;

    console.log("Payment verification requested:", reference);

    const order = await Order.findOne({
      paymentReference: reference,
      userSession: userId,
    });

    if (!order) {
      return res.json({
        status: false,
        message: "Order not found",
      });
    }

    // For demo purposes, we'll consider any payment with "demo_success" as successful
    if (reference.includes("success")) {
      order.status = "paid";
      order.paymentStatus = "success";
      await order.save();

      return res.json({
        status: true,
        message: "Payment verified successfully",
        data: {
          orderId: order._id,
          amount: order.total,
          status: "success",
        },
      });
    } else {
      order.paymentStatus = "failed";
      await order.save();

      return res.json({
        status: false,
        message: "Payment verification failed",
      });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      status: false,
      message: "Payment verification failed",
    });
  }
});

// Payment success callback
router.get("/success", async (req, res) => {
  try {
    const { reference, userId } = req.query;

    const order = await Order.findOne({ paymentReference: reference });
    if (order) {
      order.status = "paid";
      order.paymentStatus = "success";
      await order.save();
    }

    res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Successful</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                        color: white;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .success-container {
                        background: white;
                        color: #333;
                        padding: 40px;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                    .checkmark {
                        font-size: 4em;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="success-container">
                    <div class="checkmark">✅</div>
                    <h1>Payment Successful!</h1>
                    <p>Thank you for your order. Your payment has been processed successfully.</p>
                    <p>You can close this window and return to the chat.</p>
                    <button onclick="window.close()" style="
                        padding: 12px 30px; 
                        background: #4CAF50; 
                        color: white; 
                        border: none; 
                        border-radius: 8px; 
                        cursor: pointer;
                        font-size: 16px;
                        margin-top: 20px;">
                        Close Window
                    </button>
                </div>
                <script>
                    // Notify parent window
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'payment_success',
                            reference: '${reference}'
                        }, '*');
                    }
                    
                    setTimeout(() => {
                        window.close();
                    }, 5000);
                </script>
            </body>
            </html>
        `);
  } catch (error) {
    console.error("Payment success callback error:", error);
    res.status(500).send("Error processing payment success");
  }
});

// Helper function to get base URL
function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

module.exports = router;
