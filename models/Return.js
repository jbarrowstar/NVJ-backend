const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  invoiceNumber: String,
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
    },
  ],
  grandTotal: Number,
  returnReason: String,
  returnType: String,
  returnWeight: Number, // Added returnWeight field
  returnDate: String,
  returnTime: String,
  status: { type: String, default: 'Completed' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Return', returnSchema);