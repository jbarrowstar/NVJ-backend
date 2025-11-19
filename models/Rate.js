const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  metal: { type: String, enum: ['gold', 'silver'], required: true },
  purity: { type: String, enum: ['24K', '22K', '18K', null], default: null },
  price: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

rateSchema.index({ metal: 1, purity: 1 }, { unique: true });

module.exports = mongoose.model('Rate', rateSchema);
