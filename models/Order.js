const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  invoiceNumber: { type: String, required: true, unique: true },
  customer: {
    name: String,
    phone: String,
    email: String,
    gstNumber: String,
    aadharNumber: String,
    panNumber: String,
  },
  items: [
    {
      name: String,
      price: Number,
      qty: Number,
      sku: String,
      category: String,
      metal: String,
      purity: String,
      costPrice: Number,
      metalWeight: { type: Number, default: 0 },
      stoneWeight: { type: Number, default: 0 },
      netWeight: { type: Number, default: 0 },
      makingCharges: { type: Number, default: 0 },
      wastage: { type: Number, default: 0 },
      stonePrice: { type: Number, default: 0 },
    },
  ],
  paymentMethods: [{
    method: { 
      type: String, 
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Gold Exchange', 'Chit Settlement'],
      required: true 
    },
    amount: { 
      type: Number, 
      required: true,
      min: 0
    },
    goldExchange: {
      weight: Number,
      goldRatePerGram: Number,
      calculatedAmount: Number,
    },
    chitSettlement: {
      chitId: String,
      chitNumber: String,
      customerName: String,
      customerPhone: String,
      accumulatedGold: Number,
      chitAmount: Number,
      paidAmount: Number,
      currentGoldRate: Number,
      goldValue: Number,
      extraAmount: Number,
    }
  }],
  paymentMode: String,
  subtotal: Number,
  discount: Number,
  amountAfterDiscount: Number,
  advanceAmount: { type: Number, default: 0 }, // ADDED: Advance amount field
  extraCharges: Number,
  extraGoldAmount: Number,
  chitGoldGST: Number,
  remainingWeightGST: Number,
  tax: Number,
  grandTotal: Number,
  date: String,
  time: String,
  // Chit settlement reference with weight reduction data
  chitSettlement: {
    chitId: String,
    chitNumber: String,
    settlementAmount: Number,
    settlementType: String,
    accumulatedGoldWeight: Number,
    chitGoldUsed: Number,
    remainingWeight: Number,
    weightReduction: {
      originalMetalWeight: Number,
      chitGoldUsed: Number,
      remainingMetalWeight: Number,
      makingCharges: Number,
      wastageCharges: Number,
      totalExtraCharges: Number,
      chitGoldGST: Number,
      remainingWeightGST: Number,
      totalGST: Number,
      chitGoldValue: Number,
      remainingWeightValue: Number,
      chitGoldTotalValue: Number,
      remainingWeightTotalValue: Number,
      extraGoldAmount: Number,
      purity: String,
      goldRate: Number,
      silverRate: Number,
      calculatedAt: String
    },
    originalGrandTotal: Number,
    adjustedGrandTotal: Number
  },
  createdAt: { type: Date, default: Date.now },
});

// Virtual for total paid amount
orderSchema.virtual('totalPaid').get(function() {
  return this.paymentMethods.reduce((total, payment) => total + payment.amount, 0);
});

// Virtual for balance after advance (due or change)
orderSchema.virtual('balance').get(function() {
  const totalDue = this.grandTotal + (this.advanceAmount || 0);
  return totalDue - this.totalPaid;
});

// Ensure virtual fields are serialized when converted to JSON
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);