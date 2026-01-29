const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const mongoose = require('mongoose');
const Chit = require('../models/Chit');

// GET all customers - Your original simple version
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json({ success: true, customers });
  } catch (err) {
    console.error('Customer fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST - Check for duplicate phone number - Your original POST route
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, gstNumber, aadharNumber, panNumber } = req.body;

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
      gstNumber: gstNumber ? gstNumber.trim() : '',
      aadharNumber: aadharNumber ? aadharNumber.trim() : '',
      panNumber: panNumber ? panNumber.trim() : '',
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

// UPDATE customer - Check for duplicate phone number (excluding current customer) - Your original PUT route
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, gstNumber, aadharNumber, panNumber } = req.body;

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
        gstNumber: gstNumber ? gstNumber.trim() : '',
        aadharNumber: aadharNumber ? aadharNumber.trim() : '',
        panNumber: panNumber ? panNumber.trim() : '',
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

// DELETE customer - Your original DELETE route
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

// GET customer by phone number - Your original GET by phone route
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

// GET customer by ID - Your original GET by ID route
router.get('/:id', async (req, res) => {
  try {
    // Add validation to check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer ID format' 
      });
    }
    
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

// Additional routes with enhanced features (keeping your originals above intact)

// Enhanced GET all customers with pagination and search (alternative to the simple version)
router.get('/paginated', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, chitCustomer } = req.query;
    
    let query = {};
    
    // Filter by chit customers
    if (chitCustomer === 'true') {
      query.chitCustomer = true;
    } else if (chitCustomer === 'false') {
      query.chitCustomer = false;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Customer.countDocuments(query);
    
    res.json({ 
      success: true, 
      customers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalCustomers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Customer fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Enhanced POST for additional fields (alternative to simple POST)
router.post('/enhanced', async (req, res) => {
  try {
    const { 
      name, 
      phone, 
      email, 
      address,
      gstNumber, 
      aadharNumber, 
      panNumber,
      occupation,
      reference 
    } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and phone number are required.' 
      });
    }

    // Check if customer with same phone already exists
    const cleanedPhone = phone.replace(/\D/g, '');
    const existingCustomer = await Customer.findOne({ 
      phone: { $regex: cleanedPhone, $options: 'i' } 
    });
    
    if (existingCustomer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this phone number already exists.' 
      });
    }

    const newCustomer = new Customer({
      name: name.trim(),
      phone: cleanedPhone,
      email: email ? email.trim().toLowerCase() : '',
      address: address ? address.trim() : '',
      gstNumber: gstNumber ? gstNumber.trim() : '',
      aadharNumber: aadharNumber ? aadharNumber.trim() : '',
      panNumber: panNumber ? panNumber.trim() : '',
      occupation: occupation ? occupation.trim() : '',
      reference: reference ? reference.trim() : '',
      chitCustomer: false
    });

    await newCustomer.save();
    res.json({ 
      success: true, 
      customer: newCustomer,
      message: 'Customer saved successfully!' 
    });
  } catch (err) {
    console.error('Customer save error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this phone number already exists.' 
      });
    }
    
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

// Enhanced UPDATE with chit sync (alternative to simple PUT)
router.put('/enhanced/:id', async (req, res) => {
  try {
    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }
    
    const { 
      name, 
      phone, 
      email, 
      address,
      gstNumber, 
      aadharNumber, 
      panNumber,
      occupation,
      reference 
    } = req.body;

    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and phone number are required.' 
      });
    }

    // Check if another customer with same phone already exists
    const cleanedPhone = phone.replace(/\D/g, '');
    const existingCustomer = await Customer.findOne({ 
      phone: { $regex: cleanedPhone, $options: 'i' },
      _id: { $ne: req.params.id }
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
        phone: cleanedPhone,
        email: email ? email.trim().toLowerCase() : '',
        address: address ? address.trim() : '',
        gstNumber: gstNumber ? gstNumber.trim() : '',
        aadharNumber: aadharNumber ? aadharNumber.trim() : '',
        panNumber: panNumber ? panNumber.trim() : '',
        occupation: occupation ? occupation.trim() : '',
        reference: reference ? reference.trim() : ''
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
    
    // Update chits with new customer details
    if (updated.chitCustomer) {
      await Chit.updateMany(
        { customerId: updated._id },
        { 
          $set: { 
            customerName: updated.name,
            customerPhone: updated.phone
          } 
        }
      );
    }
    
    res.json({ 
      success: true, 
      customer: updated,
      message: 'Customer updated successfully!' 
    });
  } catch (err) {
    console.error('Customer update error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Another customer with this phone number already exists.' 
      });
    }
    
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
      message: 'Server error while updating customer' 
    });
  }
});

// Enhanced GET by ID with chits
router.get('/enhanced/:id', async (req, res) => {
  try {
    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }
    
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    // Get chits for this customer
    const chits = await Chit.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json({ 
      success: true, 
      customer,
      chits
    });
  } catch (err) {
    console.error('Customer fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer' 
    });
  }
});

// SEARCH customers
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    // Check if query is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(searchQuery);
    
    let query = {};
    
    if (isObjectId) {
      // Search by ObjectId
      query._id = searchQuery;
    } else {
      // Search by name, phone, or email
      query.$or = [
        { name: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } },
        { email: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    
    const customers = await Customer.find(query)
      .limit(50)
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      customers 
    });
  } catch (err) {
    console.error('Customer search error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while searching customers' 
    });
  }
});

// GET customer chit statistics
router.get('/:id/chit-stats', async (req, res) => {
  try {
    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }
    
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    // Get detailed chit statistics
    const chits = await Chit.find({ customerId: customer._id });
    
    const stats = {
      totalChits: chits.length,
      activeChits: chits.filter(c => c.status === 'active').length,
      completedChits: chits.filter(c => c.status === 'completed').length,
      settledChits: chits.filter(c => c.status === 'settled').length,
      defaultedChits: chits.filter(c => c.status === 'defaulted').length,
      totalInvestment: chits.reduce((sum, chit) => sum + chit.chitAmount, 0),
      totalPaid: chits.reduce((sum, chit) => sum + (chit.paidInstallments * chit.installmentAmount), 0),
      totalGoldWeight: chits.reduce((sum, chit) => sum + (chit.accumulatedGold?.totalWeight || 0), 0),
      overdueChits: chits.filter(c => c.status === 'active' && new Date(c.nextDueDate) < new Date()).length,
      upcomingDue: chits.filter(c => {
        if (c.status !== 'active') return false;
        const next30Days = new Date();
        next30Days.setDate(next30Days.getDate() + 30);
        return new Date(c.nextDueDate) <= next30Days;
      }).length
    };
    
    res.json({ 
      success: true, 
      stats,
      chits: chits.map(c => ({
        chitNumber: c.chitNumber,
        status: c.status,
        chitAmount: c.chitAmount,
        paidInstallments: c.paidInstallments,
        totalInstallments: c.totalInstallments,
        nextDueDate: c.nextDueDate,
        accumulatedGold: c.accumulatedGold
      }))
    });
  } catch (err) {
    console.error('Customer chit stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer chit statistics' 
    });
  }
});

module.exports = router;