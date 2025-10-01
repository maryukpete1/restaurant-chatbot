class ChatBot {
  constructor() {
    this.socket = io();
    this.userId = this.generateUserId();
    this.setupEventListeners();
    this.joinChat();

    // Listen for payment messages from popup window
    window.addEventListener("message", this.handlePaymentMessage.bind(this));
  }

  handlePaymentMessage(event) {
    if (event.data && event.data.type === "payment_complete") {
      if (event.data.status === "success") {
        this.displayBotMessage(
          "✅ Payment successful! Your order has been confirmed. Thank you for your purchase!",
          [
            { value: "1", text: "🛍️ Place New Order" },
            { value: "98", text: "📊 View Order History" },
          ]
        );
      } else {
        this.displayBotMessage(
          "❌ Payment failed. Please try again or contact support.",
          getMainOptions()
        );
      }
    }
  }

  async initiatePayment() {
    try {
      console.log("Initiating payment for user:", this.userId);

      const response = await fetch("/api/payment/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: this.userId,
        }),
      });

      const data = await response.json();

      if (data.status && data.data && data.data.authorization_url) {
        // Open payment window
        const paymentWindow = window.open(
          data.data.authorization_url,
          "payment",
          "width=600,height=700,scrollbars=yes"
        );

        if (!paymentWindow) {
          this.displayBotMessage(
            "❌ Please allow popups for payment processing.",
            getMainOptions()
          );
          return;
        }

        this.displayBotMessage(
          "🔄 Opening payment window... Please complete the payment in the new window.",
          [
            { value: "check_payment", text: "🔄 Check Payment Status" },
            { value: "97", text: "📋 View Order" },
            { value: "back", text: "← Main Menu" },
          ]
        );

        // Check payment status periodically
        this.checkPaymentStatus(data.data.reference);
      } else {
        throw new Error(data.message || "Payment initialization failed");
      }
    } catch (error) {
      console.error("Payment initiation error:", error);
      this.displayBotMessage(
        `❌ Payment error: ${error.message}. Please try again.`,
        getMainOptions()
      );
    }
  }

  async checkPaymentStatus(reference) {
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/payment/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reference: reference,
            userId: this.userId,
          }),
        });

        const data = await response.json();

        if (data.status && data.data && data.data.status === "success") {
          clearInterval(checkInterval);
          this.displayBotMessage(
            "✅ Payment successful! Your order has been confirmed.",
            [
              { value: "1", text: "🛍️ Place New Order" },
              { value: "98", text: "📊 View Order History" },
            ]
          );
        } else if (data.status === false) {
          clearInterval(checkInterval);
          this.displayBotMessage(
            "❌ Payment failed or was cancelled.",
            getMainOptions()
          );
        } else if (data.status && data.data && data.data.status === "pending") {
          // keep polling silently
        }
        // If still pending, continue checking
      } catch (error) {
        console.error("Payment status check error:", error);
        clearInterval(checkInterval);
      }
    }, 3000); // Check every 3 seconds

    // Stop checking after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 300000);
  }

  setupEventListeners() {
    const sendButton = document.getElementById("sendButton");
    const messageInput = document.getElementById("messageInput");

    sendButton.addEventListener("click", () => this.sendMessage());
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendMessage();
    });

    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("option-btn")) {
        const option = e.target.dataset.option;
        const action = e.target.dataset.action;

        if (action === "initiate_payment") {
          this.addMessage("💳 Proceed to Payment", "user");
          this.initiatePayment();
        } else {
          this.selectOption(option);
        }
      }
    });

    this.socket.on("bot-response", (data) => {
      this.displayBotMessage(data.message, data.options, data.order);
    });
  }

  generateUserId() {
    let userId = localStorage.getItem("chatbotUserId");
    if (!userId) {
      userId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("chatbotUserId", userId);
    }
    return userId;
  }

  joinChat() {
    this.socket.emit("join", this.userId);
  }

  selectOption(option) {
    this.addMessage(option, "user");
    this.processOption(option);
  }

  async processOption(option) {
    try {
      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: this.userId,
          message: option,
        }),
      });

      const data = await response.json();
      this.displayBotMessage(data.message, data.options, data.order);
    } catch (error) {
      console.error("Error:", error);
      this.displayBotMessage(
        "Sorry, there was an error processing your request. Please try again.",
        getMainOptions()
      );
    }
  }

  addMessage(message, sender) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}-message`;

    // Extract text from option buttons if it's a user message from button click
    const messageText =
      message.length > 50 ? message.substring(0, 50) + "..." : message;

    messageDiv.innerHTML = `
            <div class="message-content">
                <p>${this.escapeHtml(messageText)}</p>
            </div>
        `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  displayBotMessage(message, options = null, order = null) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot-message";

    let optionsHTML = "";
    if (options && options.length > 0) {
      // In the displayBotMessage function in public/script.js, update the options rendering:
      optionsHTML =
        '<div class="options">' +
        options
          .map((opt) => {
            if (opt.action === "initiate_payment") {
              return `<button class="option-btn payment-btn" 
                    data-option="${opt.value}" 
                    data-action="${opt.action}">${opt.text}</button>`;
            } else {
              return `<button class="option-btn" data-option="${opt.value}">${opt.text}</button>`;
            }
          })
          .join("") +
        "</div>";
    }

    let orderHTML = "";
    if (order && order.items && order.items.length > 0) {
      orderHTML =
        '<div class="order-summary"><h4>📋 Order Summary</h4>' +
        order.items
          .map(
            (item) =>
              `<div class="order-item">${item.quantity}x ${item.name} - ₦${
                item.price * item.quantity
              }</div>`
          )
          .join("") +
        `<div class="order-total"><strong>Total: ₦${order.total}</strong></div></div>`;
    }

    messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.formatMessage(message)}</div>
                ${orderHTML}
                ${optionsHTML}
            </div>
        `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  formatMessage(text) {
    // Convert markdown-like formatting to HTML
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>")
      .replace(
        /(🛍️|💰|📊|📋|❌|✅|💳|➕|🏠)/g,
        '<span class="emoji">$1</span>'
      );
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value.trim();

    if (message) {
      this.addMessage(message, "user");
      this.processOption(message);
      input.value = "";
    }
  }
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

// Initialize chatbot when page loads
document.addEventListener("DOMContentLoaded", () => {
  new ChatBot();
});
