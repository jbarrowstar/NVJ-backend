const mongoose = require('mongoose');

const chitSchema = new mongoose.Schema({
  chitNumber: { 
    type: String, 
    required: true, 
    unique: true, 
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
  customerPhone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  
  // Chit Details
  chitAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  installmentAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  totalInstallments: { 
    type: Number, 
    required: true,
    default: 11,
    min: 1 
  },
  paidInstallments: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  remainingInstallments: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  
  // Gold Accumulation Details
  accumulatedGold: {
    totalWeight: { type: Number, default: 0 },
    weightPerInstallment: { type: Number, default: 0 },
    currentGoldRate: { type: Number, default: 0 },
    purity: { type: String, default: '22K' },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Payment Schedule
  nextDueDate: { 
    type: Date, 
    required: true 
  },
  paymentHistory: [{
    installmentNumber: Number,
    paymentDate: Date,
    amount: Number,
    goldRate: Number,
    goldWeight: Number,
    receiptNumber: String
  }],
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'completed', 'defaulted', 'cancelled', 'settled'],
    default: 'active' 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'bank', 'upi', 'gold'],
    default: 'cash'
  },
  agentName: { 
    type: String, 
    trim: true 
  },
  notes: { 
    type: String, 
    trim: true 
  },
  
  // Settlement Fields - UPDATED: Added settlementGoldRate
  settlementType: { 
    type: String, 
    enum: ['cash', 'gold', 'partial_gold', 'purchase_settlement', 'chit_settlement'] 
  },
  settlementDate: { 
    type: Date 
  },
  settlementAmount: { 
    type: Number, 
    min: 0 
  },
  settlementGoldRate: { // Gold rate at settlement time
    type: Number,
    min: 0
  },
  settlementStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'disputed'],
    default: 'pending'
  },
  
  // Purchase settlement fields
  purchaseInvoiceNumber: {
    type: String,
    trim: true
  },
  purchaseItems: [{
    name: String,
    sku: String,
    price: Number,
    quantity: Number
  }],
  
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

// Virtuals
chitSchema.virtual('completionPercentage').get(function() {
  return this.totalInstallments > 0 
    ? Math.round((this.paidInstallments / this.totalInstallments) * 100) 
    : 0;
});

chitSchema.virtual('totalPaid').get(function() {
  return this.paidInstallments * this.installmentAmount;
});

chitSchema.virtual('remainingAmount').get(function() {
  return this.remainingInstallments * this.installmentAmount;
});

chitSchema.virtual('accumulatedGoldValue').get(function() {
  return this.accumulatedGold.totalWeight * this.accumulatedGold.currentGoldRate;
});

chitSchema.virtual('settlementGoldValue').get(function() {
  if (this.settlementType === 'gold' || this.settlementType === 'partial_gold') {
    if (this.accumulatedGold.totalWeight && this.settlementGoldRate) {
      return this.accumulatedGold.totalWeight * this.settlementGoldRate;
    }
  }
  return 0;
});

chitSchema.virtual('progressStatus').get(function() {
  if (this.status === 'settled') return 'settled';
  if (this.status === 'completed') return 'completed';
  if (this.status === 'defaulted') return 'defaulted';
  if (this.status === 'cancelled') return 'cancelled';
  
  const percentage = this.completionPercentage;
  if (percentage >= 100) return 'completed';
  if (percentage >= 75) return 'almost-completed';
  if (percentage >= 50) return 'half-way';
  if (percentage >= 25) return 'in-progress';
  return 'new';
});

chitSchema.virtual('isOverdue').get(function() {
  if (this.status !== 'active') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(this.nextDueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
});

chitSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  const today = new Date();
  const dueDate = new Date(this.nextDueDate);
  const diffTime = Math.abs(today - dueDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware
chitSchema.pre('save', function(next) {
  // Calculate remaining installments
  this.remainingInstallments = this.totalInstallments - this.paidInstallments;
  
  // Auto-update status based on payments
  if (this.status === 'active' && this.paidInstallments >= this.totalInstallments) {
    this.status = 'completed';
    this.endDate = new Date();
  }
  
  // Auto-set settlement status if settlement amount is provided
  if (this.settlementAmount && this.settlementAmount > 0 && !this.settlementStatus) {
    this.settlementStatus = 'completed';
  }
  
  // Update timestamps
  this.updatedAt = Date.now();
  
  next();
});

// Indexes for better query performance - REMOVED DUPLICATE chitNumber index
// The unique: true on line 8 automatically creates an index
// So we remove line 192: chitSchema.index({ chitNumber: 1 });
chitSchema.index({ customerId: 1 });
chitSchema.index({ status: 1 });
chitSchema.index({ nextDueDate: 1 });
chitSchema.index({ startDate: -1 });
chitSchema.index({ endDate: -1 });
chitSchema.index({ createdAt: -1 });
chitSchema.index({ 'accumulatedGold.totalWeight': -1 });
chitSchema.index({ customerName: 'text', customerPhone: 'text', chitNumber: 'text' });

// Static methods
chitSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

chitSchema.statics.findOverdue = function() {
  const today = new Date();
  return this.find({
    status: 'active',
    nextDueDate: { $lt: today }
  });
};

chitSchema.statics.findUpcomingDue = function(days = 30) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);
  
  return this.find({
    status: 'active',
    nextDueDate: { 
      $gte: today,
      $lte: futureDate
    }
  });
};

chitSchema.statics.findByCustomerPhone = function(phone) {
  return this.find({ customerPhone: { $regex: phone, $options: 'i' } });
};

chitSchema.statics.getSettledChitsStats = async function() {
  const result = await this.aggregate([
    { $match: { status: 'settled' } },
    { $group: {
      _id: '$settlementType',
      count: { $sum: 1 },
      totalAmount: { $sum: '$settlementAmount' },
      totalGoldWeight: { $sum: '$accumulatedGold.totalWeight' }
    }}
  ]);
  
  return result;
};

module.exports = mongoose.model('Chit', chitSchema);