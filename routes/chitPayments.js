const express = require('express');
const router = express.Router();
const ChitPayment = require('../models/ChitPayment');
const Chit = require('../models/Chit');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

// GET payments for a specific chit
router.get('/chit/:chitId', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    // Validate chitId
    if (!mongoose.Types.ObjectId.isValid(req.params.chitId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const payments = await ChitPayment.find({ chitId: req.params.chitId })
      .sort({ installmentNumber: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await ChitPayment.countDocuments({ chitId: req.params.chitId });
    
    res.json({ 
      success: true, 
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalPayments: total
      }
    });
  } catch (err) {
    console.error('Payments fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payments' 
    });
  }
});

// Record a payment (direct access endpoint) - UPDATED
router.post('/', async (req, res) => {
  try {
    const paymentData = req.body;
    
    // Validate required fields - UPDATED
    if (!paymentData.chitId || !paymentData.amount || !paymentData.paymentMethod || !paymentData.currentGoldRate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment fields. Amount, payment method, and current gold rate are required.'
      });
    }
    
    // Validate gold rate
    if (paymentData.currentGoldRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Current gold rate must be greater than 0'
      });
    }
    
    // Validate chitId
    if (!mongoose.Types.ObjectId.isValid(paymentData.chitId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    // Verify chit exists
    const chit = await Chit.findById(paymentData.chitId);
    if (!chit) {
      return res.status(404).json({
        success: false,
        message: 'Chit not found'
      });
    }
    
    // Generate receipt number if not provided
    if (!paymentData.receiptNumber) {
      paymentData.receiptNumber = `CHIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    
    // Prepare payment data with gold details
    const paymentRecord = {
      chitId: paymentData.chitId,
      chitNumber: chit.chitNumber || paymentData.chitNumber,
      customerId: chit.customerId || paymentData.customerId,
      customerName: chit.customerName || paymentData.customerName,
      installmentNumber: chit.paidInstallments + 1,
      amount: paymentData.amount,
      paymentDate: paymentData.paymentDate ? new Date(paymentData.paymentDate) : new Date(),
      paymentMethod: paymentData.paymentMethod,
      receiptNumber: paymentData.receiptNumber,
      goldDetails: {
        goldRate: paymentData.currentGoldRate,
        goldWeight: paymentData.amount / paymentData.currentGoldRate,
        purity: '22K',
        calculatedValue: paymentData.amount
      },
      notes: paymentData.notes || '',
      collectedBy: paymentData.collectedBy || 'Admin'
    };
    
    const payment = new ChitPayment(paymentRecord);
    await payment.save();
    
    res.json({ 
      success: true, 
      payment,
      message: 'Payment recorded successfully' 
    });
  } catch (err) {
    console.error('Payment record error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Receipt number already exists' 
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
      message: 'Server error while recording payment' 
    });
  }
});

// GET payment statistics - UPDATED to remove lateFee and discount
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = { paymentStatus: 'completed' };
    
    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) {
        query.paymentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.paymentDate.$lte = new Date(endDate);
      }
    }
    
    const stats = await ChitPayment.aggregate([
      { $match: query },
      { $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        netAmount: { $sum: '$amount' }, // Same as totalAmount
        cashPayments: { 
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, 1, 0] } 
        },
        bankPayments: { 
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'bank'] }, 1, 0] } 
        },
        upiPayments: { 
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, 1, 0] } 
        },
        goldPayments: { 
          $sum: { $cond: [{ $eq: ['$paymentMethod', 'gold'] }, 1, 0] } 
        },
        totalGoldWeight: { $sum: '$goldDetails.goldWeight' }
      }}
    ]);
    
    res.json({
      success: true,
      stats: stats[0] || {
        totalPayments: 0,
        totalAmount: 0,
        netAmount: 0,
        cashPayments: 0,
        bankPayments: 0,
        upiPayments: 0,
        goldPayments: 0,
        totalGoldWeight: 0
      }
    });
  } catch (err) {
    console.error('Payment stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment stats' 
    });
  }
});

// GET payments by customer
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    // Validate customerId
    if (!mongoose.Types.ObjectId.isValid(req.params.customerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }
    
    const payments = await ChitPayment.find({ customerId: req.params.customerId })
      .sort({ paymentDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('chitId', 'chitNumber chitAmount installmentAmount');
    
    const total = await ChitPayment.countDocuments({ customerId: req.params.customerId });
    
    res.json({ 
      success: true, 
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalPayments: total
      }
    });
  } catch (err) {
    console.error('Customer payments fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer payments' 
    });
  }
});

// GET recent payments
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const payments = await ChitPayment.find({ paymentStatus: 'completed' })
      .sort({ paymentDate: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .populate('chitId', 'chitNumber customerName')
      .populate('customerId', 'name phone');
    
    res.json({ 
      success: true, 
      payments
    });
  } catch (err) {
    console.error('Recent payments fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching recent payments' 
    });
  }
});

// GET payment by receipt number
router.get('/receipt/:receiptNumber', async (req, res) => {
  try {
    const payment = await ChitPayment.findOne({ receiptNumber: req.params.receiptNumber })
      .populate('chitId', 'chitNumber customerName customerPhone chitAmount installmentAmount totalInstallments')
      .populate('customerId', 'name phone email');
    
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }
    
    res.json({ 
      success: true, 
      payment
    });
  } catch (err) {
    console.error('Payment fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching payment' 
    });
  }
});

// SEARCH payments
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    const payments = await ChitPayment.find({
      $or: [
        { receiptNumber: { $regex: searchQuery, $options: 'i' } },
        { chitNumber: { $regex: searchQuery, $options: 'i' } },
        { customerName: { $regex: searchQuery, $options: 'i' } }
      ]
    })
    .limit(50)
    .sort({ paymentDate: -1 })
    .populate('chitId', 'chitNumber chitAmount');

    res.json({ 
      success: true, 
      payments 
    });
  } catch (err) {
    console.error('Payment search error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while searching payments' 
    });
  }
});

module.exports = router;