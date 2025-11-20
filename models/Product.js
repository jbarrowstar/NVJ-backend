const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, index: true, trim: true },
  category: { type: String, trim: true, default: '' },
  metal: { type: String, enum: ['gold', 'silver'], required: true },
  weight: { type: Number, default: 0 }, // metal weight in grams - CHANGED TO NUMBER
  stoneWeight: { type: Number, default: 0 }, // stone weight in grams - CHANGED TO NUMBER
  netWeight: { type: Number, default: 0 }, // total weight = metal + stone in grams - CHANGED TO NUMBER
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

// Calculate net weight before saving
productSchema.pre('save', function(next) {
  // Trim text fields
  if (this.name) this.name = String(this.name).trim();
  if (this.sku) this.sku = String(this.sku).trim();
  if (this.category) this.category = String(this.category).trim();
  
  // Calculate net weight (metal weight + stone weight)
  const metalWeight = parseFloat(this.weight || '0') || 0;
  const stoneWeight = parseFloat(this.stoneWeight || '0') || 0;
  this.netWeight = (metalWeight + stoneWeight).toFixed(2);
  
  next();
});

// Also calculate net weight before updating
productSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$set) {
    const metalWeight = parseFloat(update.$set.weight || '0') || 0;
    const stoneWeight = parseFloat(update.$set.stoneWeight || '0') || 0;
    update.$set.netWeight = (metalWeight + stoneWeight).toFixed(2);
  } else {
    const metalWeight = parseFloat(update.weight || '0') || 0;
    const stoneWeight = parseFloat(update.stoneWeight || '0') || 0;
    update.netWeight = (metalWeight + stoneWeight).toFixed(2);
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);