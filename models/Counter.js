// backend/models/Counter.js
const mongoose = require('mongoose');

// Simple atomic counter for SKU or other sequences
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g., "SKU_RIN_202511"
  value: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Counter', counterSchema);
