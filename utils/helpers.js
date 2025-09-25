// Utility functions
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amount);
}

function generateOrderId() {
  return (
    "ORD" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase()
  );
}

module.exports = {
  validateEmail,
  formatCurrency,
  generateOrderId,
};
