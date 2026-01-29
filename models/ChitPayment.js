const mongoose = require('mongoose');

const chitPaymentSchema = new mongoose.Schema({
  chitId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chit', 
    required: true 
  },
  chitNumber: { 
    type: String, 
    required: true, 
    trim: true 
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  customerName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  installmentNumber: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  
  // Payment Details - UPDATED
  amount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  paymentDate: { 
    type: Date, 
    required: true, 
    default: Date.now 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'bank', 'upi', 'gold'],
    required: true 
  },
  
  // Gold Calculation - UPDATED to store current gold rate
  goldDetails: {
    goldRate: { type: Number, required: true, min: 0 }, // REQUIRED now
    goldWeight: { type: Number, default: 0, min: 0 },
    purity: { type: String, default: '22K' },
    calculatedValue: { type: Number, default: 0, min: 0 }
  },
  
  receiptNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  // REMOVED: lateFee and discount fields
  notes: { 
    type: String, 
    trim: true 
  },
  collectedBy: { 
    type: String, 
    trim: true,
    default: 'Admin'
  },
  
  // Payment status tracking
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed'
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals - UPDATED to remove lateFee and discount
chitPaymentSchema.virtual('totalAmount').get(function() {
  return this.amount; // Simplified, no more lateFee and discount
});

chitPaymentSchema.virtual('goldValue').get(function() {
  return this.goldDetails.goldWeight * this.goldDetails.goldRate;
});

chitPaymentSchema.virtual('formattedPaymentDate').get(function() {
  return this.paymentDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
});

// Pre-save middleware - UPDATED
chitPaymentSchema.pre('save', function(next) {
  // Ensure gold rate is set
  if (!this.goldDetails.goldRate || this.goldDetails.goldRate <= 0) {
    return next(new Error('Gold rate is required for payment'));
  }
  
  // Calculate gold weight based on amount and gold rate
  if (this.amount > 0) {
    this.goldDetails.goldWeight = this.amount / this.goldDetails.goldRate;
    this.goldDetails.calculatedValue = this.amount;
  }
  
  // Update timestamp
  this.updatedAt = Date.now();
  
  next();
});

// Static methods - UPDATED to remove lateFee and discount calculations
chitPaymentSchema.statics.getPaymentStats = async function(startDate, endDate) {
  const match = { paymentStatus: 'completed' };
  
  if (startDate || endDate) {
    match.paymentDate = {};
    if (startDate) match.paymentDate.$gte = new Date(startDate);
    if (endDate) match.paymentDate.$lte = new Date(endDate);
  }
  
  const stats = await this.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      totalPayments: { $sum: 1 },
      totalAmount: { $sum: '$amount' },
      totalGoldWeight: { $sum: '$goldDetails.goldWeight' },
      netAmount: { $sum: '$amount' }, // Same as totalAmount now
      cashPayments: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, 1, 0] } },
      bankPayments: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'bank'] }, 1, 0] } },
      upiPayments: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, 1, 0] } },
      goldPayments: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'gold'] }, 1, 0] } }
    }}
  ]);
  
  return stats[0] || {
    totalPayments: 0,
    totalAmount: 0,
    totalGoldWeight: 0,
    netAmount: 0,
    cashPayments: 0,
    bankPayments: 0,
    upiPayments: 0,
    goldPayments: 0
  };
};

chitPaymentSchema.statics.getPaymentsByMethod = async function() {
  return this.aggregate([
    { $match: { paymentStatus: 'completed' } },
    { $group: {
      _id: '$paymentMethod',
      count: { $sum: 1 },
      totalAmount: { $sum: '$amount' },
      totalGoldWeight: { $sum: '$goldDetails.goldWeight' }
    }},
    { $sort: { count: -1 } }
  ]);
};

chitPaymentSchema.statics.getRecentPayments = async function(limit = 20) {
  return this.find({ paymentStatus: 'completed' })
    .sort({ paymentDate: -1, createdAt: -1 })
    .limit(limit)
    .populate('chitId', 'chitNumber chitAmount installmentAmount')
    .populate('customerId', 'name phone');
};

module.exports = mongoose.model('ChitPayment', chitPaymentSchema);