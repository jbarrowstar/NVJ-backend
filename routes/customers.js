const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

// GET all customers
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json({ success: true, customers });
  } catch (err) {
    console.error('Customer fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST - Check for duplicate phone number
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and phone number are required.' 
      });
    }

    // Check if customer with same phone already exists
    const existingCustomer = await Customer.findOne({ 
      phone: phone.trim() 
    });
    
    if (existingCustomer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this phone number already exists.' 
      });
    }

    const newCustomer = new Customer({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      notes: notes ? notes.trim() : '',
    });

    await newCustomer.save();
    res.json({ 
      success: true, 
      customer: newCustomer,
      message: 'Customer saved successfully!' 
    });
  } catch (err) {
    console.error('Customer save error:', err);
    
    // Handle duplicate key errors (if phone is set as unique in schema)
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this phone number already exists.' 
      });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while saving customer' 
    });
  }
});

// UPDATE customer - Check for duplicate phone number (excluding current customer)
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and phone number are required.' 
      });
    }

    // Check if another customer with same phone already exists
    const existingCustomer = await Customer.findOne({ 
      phone: phone.trim(),
      _id: { $ne: req.params.id } // Exclude current customer from check
    });
    
    if (existingCustomer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Another customer with this phone number already exists.' 
      });
    }

    const updated = await Customer.findByIdAndUpdate(
      req.params.id, 
      {
        name: name.trim(),
        phone: phone.trim(),
        email: email ? email.trim() : '',
        notes: notes ? notes.trim() : '',
      }, 
      {
        new: true,
        runValidators: true,
      }
    );
    
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      customer: updated,
      message: 'Customer updated successfully!' 
    });
  } catch (err) {
    console.error('Customer update error:', err);
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Another customer with this phone number already exists.' 
      });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors 
      });
    }
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating customer' 
    });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Customer deleted successfully!' 
    });
  } catch (err) {
    console.error('Customer delete error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting customer' 
    });
  }
});

// GET customer by phone number
router.get('/phone/:phone', async (req, res) => {
  try {
    const customer = await Customer.findOne({ 
      phone: req.params.phone 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      customer 
    });
  } catch (err) {
    console.error('Customer fetch by phone error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer' 
    });
  }
});

// GET customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      customer 
    });
  } catch (err) {
    console.error('Customer fetch error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer' 
    });
  }
});

module.exports = router;