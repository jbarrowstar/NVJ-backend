const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  invoiceNumber: { type: String, required: true, unique: true },
  customer: {
    name: String,
    phone: String,
    email: String,
  },
  items: [
    {
      name: String,
      price: Number,
      qty: Number,
      sku: String,
      category: String, // ADDED
      metal: String, // ADDED
      costPrice: Number, // ADDED
      metalWeight: { type: Number, default: 0 }, // ADDED: metal weight in grams
      stoneWeight: { type: Number, default: 0 }, // ADDED: stone weight in grams
      netWeight: { type: Number, default: 0 }, // ADDED: total weight in grams
    },
  ],
  // Updated payment fields for multiple payment methods
  paymentMethods: [{
    method: { 
      type: String, 
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Wallet'],
      required: true 
    },
    amount: { 
      type: Number, 
      required: true,
      min: 0
    }
  }],
  // Keep paymentMode for backward compatibility (optional)
  paymentMode: String,
  subtotal: Number,
  discount: Number,
  tax: Number,
  grandTotal: Number,
  date: String,
  time: String,
  createdAt: { type: Date, default: Date.now },
});

// Virtual for total paid amount
orderSchema.virtual('totalPaid').get(function() {
  return this.paymentMethods.reduce((total, payment) => total + payment.amount, 0);
});

// Virtual for balance (due or change)
orderSchema.virtual('balance').get(function() {
  return this.grandTotal - this.totalPaid;
});

// Ensure virtual fields are serialized when converted to JSON
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);