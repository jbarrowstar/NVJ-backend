const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, index: true, trim: true },
  category: { type: String, trim: true, default: '' },
  metal: { type: String, enum: ['gold', 'silver'], required: true },
  weight: { type: Number, default: 0 }, // metal weight in grams
  stoneWeight: { type: Number, default: 0 }, // stone weight in grams
  netWeight: { type: Number, default: 0 }, // total weight = metal + stone in grams
  purity: { type: String, trim: true, default: '' },  // e.g. "22K"
  makingCharges: { type: Number, default: 0, min: 0 },
  wastage: { type: Number, default: 0, min: 0 }, // percent
  stonePrice: { type: Number, default: 0, min: 0 },
  price: { type: Number, required: true, min: 0 }, // currency as Number (INR)
  description: { type: String, default: '' },
  image: { type: String, default: '' }, // path like /uploads/...
  qrCode: { type: String, default: '' },
  available: { type: Boolean, default: true },
}, { timestamps: true });

// Calculate net weight before saving - FIXED: Store as Number, not String
productSchema.pre('save', function(next) {
  // Trim text fields
  if (this.name) this.name = String(this.name).trim();
  if (this.sku) this.sku = String(this.sku).trim();
  if (this.category) this.category = String(this.category).trim();
  
  // Calculate net weight (metal weight + stone weight)
  // FIX: Remove .toFixed(2) to keep as Number, or wrap in Number()
  const metalWeight = parseFloat(this.weight || '0') || 0;
  const stoneWeight = parseFloat(this.stoneWeight || '0') || 0;
  this.netWeight = metalWeight + stoneWeight; // Store as Number
  
  next();
});

// Also calculate net weight before updating - FIXED: Store as Number, not String
productSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  // Get metal and stone weight values
  let metalWeight = 0;
  let stoneWeight = 0;
  
  if (update.$set) {
    metalWeight = parseFloat(update.$set.weight || update.weight || '0') || 0;
    stoneWeight = parseFloat(update.$set.stoneWeight || update.stoneWeight || '0') || 0;
  } else {
    metalWeight = parseFloat(update.weight || '0') || 0;
    stoneWeight = parseFloat(update.stoneWeight || '0') || 0;
  }
  
  // Calculate net weight as Number
  const netWeight = metalWeight + stoneWeight;
  
  // Update the netWeight field
  if (update.$set) {
    update.$set.netWeight = netWeight;
  } else {
    update.netWeight = netWeight;
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);