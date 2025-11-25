
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  phone: { 
    type: String, 
    required: true,
    unique: true, // Enforce unique phone numbers
    trim: true
  },
  email: { 
    type: String, 
    trim: true,
    lowercase: true
  },
  gstNumber: { 
    type: String,
    trim: true
  },
  notes: { 
    type: String, 
    trim: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Customer', customerSchema);