const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Chit = require('../models/Chit');
const ChitPayment = require('../models/ChitPayment');
const Customer = require('../models/Customer');
const Rate = require('../models/Rate');
const { generateChitNumber, generateReceiptNumber } = require('../utils/counterHelper');

// Helper function to update customer chit stats
const updateCustomerChitStats = async (customerId, updates) => {
  try {
    await Customer.findByIdAndUpdate(customerId, updates);
  } catch (err) {
    console.error('Failed to update customer stats:', err);
  }
};

// GET all chits with filters - UPDATED: Removed paymentMethod filter
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search,
      phone
    } = req.query;
    
    let query = {};
    
    // Status filter
    if (status && status !== 'All Status') {
      query.status = status.toLowerCase();
    }

    // Phone filter for specific customer
    if (phone) {
      query.customerPhone = { $regex: phone.replace(/\D/g, ''), $options: 'i' };
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { chitNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const chits = await Chit.find(query)
      .sort({ nextDueDate: 1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Chit.countDocuments(query);
    
    res.json({ 
      success: true, 
      chits,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalChits: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Chits fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching chits' 
    });
  }
});

// CREATE new chit - UPDATED: paymentMethod is optional now
router.post('/', async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerPhone,
      startDate,
      endDate,
      chitAmount,
      totalInstallments = 11,
      notes
    } = req.body;

    // Validate required fields
    if (!customerId || !customerName || !customerPhone || !chitAmount || !totalInstallments) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields are missing' 
      });
    }

    // Validate customerId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    // Generate chit number
    const chitNumber = await generateChitNumber();
    
    // Calculate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nextDue = new Date(start);
    nextDue.setMonth(nextDue.getMonth() + 1);
    
    // Calculate installment amount
    const installmentAmount = Math.round(chitAmount / totalInstallments);

    // Get current gold rate
    const goldRate = await Rate.findOne({ metal: 'gold', purity: '22K' });
    const currentGoldRate = goldRate ? goldRate.price : 5000; // Default rate

    const newChit = new Chit({
      chitNumber,
      customerId,
      customerName,
      customerPhone,
      startDate: start,
      endDate: end,
      chitAmount,
      installmentAmount,
      totalInstallments,
      paidInstallments: 0,
      remainingInstallments: totalInstallments,
      nextDueDate: nextDue,
      status: 'active',
      paymentMethod: 'cash', // Default to cash, can be updated later
      notes: notes || '',
      accumulatedGold: {
        totalWeight: 0,
        weightPerInstallment: installmentAmount / currentGoldRate,
        currentGoldRate,
        purity: '22K',
        lastUpdated: new Date()
      }
    });

    await newChit.save();

    // Update customer chit status
    await updateCustomerChitStats(customerId, {
      $set: { chitCustomer: true },
      $inc: { 
        'chitDetails.totalChits': 1,
        'chitDetails.activeChits': 1,
        'chitDetails.totalInvestment': chitAmount
      }
    });

    res.json({ 
      success: true, 
      chit: newChit,
      message: 'Chit created successfully' 
    });
  } catch (err) {
    console.error('Chit create error:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Chit number already exists' 
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
      message: 'Server error while creating chit' 
    });
  }
});

// RECORD payment for chit - UPDATED: Uses currentGoldRate from request
router.post('/:id/payment', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const chit = await Chit.findById(req.params.id);
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }

    if (chit.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'Chit is not active' 
      });
    }

    const { 
      chitId,
      chitNumber,
      customerId,
      customerName,
      installmentNumber,
      amount, 
      paymentMethod = 'cash', 
      paymentDate, 
      receiptNumber,
      currentGoldRate, // Get current gold rate from frontend
      notes, 
      collectedBy 
    } = req.body;
    
    // Validate current gold rate
    if (!currentGoldRate || currentGoldRate <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current gold rate is required and must be greater than 0' 
      });
    }
    
    // Validate the installment number matches expected
    const expectedInstallmentNumber = chit.paidInstallments + 1;
    if (installmentNumber && installmentNumber !== expectedInstallmentNumber) {
      return res.status(400).json({ 
        success: false, 
        message: `Expected installment number ${expectedInstallmentNumber}, got ${installmentNumber}` 
      });
    }

    const actualInstallmentNumber = chit.paidInstallments + 1;
    
    // Calculate gold weight for this payment using provided currentGoldRate
    const goldWeight = amount / currentGoldRate;
    
    // Use provided receipt number or generate new
    const receiptNum = receiptNumber || await generateReceiptNumber();
    
    // Create payment record
    const payment = new ChitPayment({
      chitId: chit._id,
      chitNumber: chit.chitNumber,
      customerId: chit.customerId,
      customerName: chit.customerName,
      installmentNumber: actualInstallmentNumber,
      amount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod,
      receiptNumber: receiptNum,
      goldDetails: {
        goldRate: currentGoldRate, // Store the current gold rate from request
        goldWeight,
        purity: '22K',
        calculatedValue: amount
      },
      notes: notes || '',
      collectedBy: collectedBy || 'Admin'
    });

    await payment.save();

    // Update chit
    chit.paidInstallments = actualInstallmentNumber;
    chit.remainingInstallments = chit.totalInstallments - actualInstallmentNumber;
    chit.paymentMethod = paymentMethod; // Update payment method
    
    // Update accumulated gold using current gold rate
    chit.accumulatedGold.totalWeight += goldWeight;
    chit.accumulatedGold.currentGoldRate = currentGoldRate; // Update to current rate
    chit.accumulatedGold.lastUpdated = new Date();
    
    // Add to payment history
    chit.paymentHistory.push({
      installmentNumber: actualInstallmentNumber,
      paymentDate: payment.paymentDate,
      amount,
      goldRate: currentGoldRate,
      goldWeight,
      receiptNumber: receiptNum
    });

    // Update next due date (add 1 month)
    const nextDue = new Date(chit.nextDueDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    chit.nextDueDate = nextDue;

    // Check if chit is completed
    if (chit.paidInstallments >= chit.totalInstallments) {
      chit.status = 'completed';
      chit.endDate = new Date();
      
      // Update customer stats
      await updateCustomerChitStats(chit.customerId, {
        $inc: { 
          'chitDetails.completedChits': 1,
          'chitDetails.activeChits': -1,
          'chitDetails.totalGoldWeight': chit.accumulatedGold.totalWeight
        }
      });
    } else {
      // Update customer payment stats
      await updateCustomerChitStats(chit.customerId, {
        $inc: { 
          'chitDetails.totalPaid': amount,
          'chitDetails.totalGoldWeight': goldWeight,
          'chitDetails.totalInstallmentsPaid': 1
        }
      });
    }

    await chit.save();

    res.json({ 
      success: true, 
      payment,
      chit,
      message: `Payment recorded. Receipt #${receiptNum}` 
    });
  } catch (err) {
    console.error('Payment record error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while recording payment' 
    });
  }
});

// GET chit by ID
router.get('/:id', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const chit = await Chit.findById(req.params.id);
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }
    
    res.json({ 
      success: true, 
      chit 
    });
  } catch (err) {
    console.error('Chit fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching chit' 
    });
  }
});

// UPDATE chit
router.put('/:id', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates._id;
    delete updates.chitNumber;
    delete updates.createdAt;
    
    const chit = await Chit.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }
    
    // If customer details were updated, sync with all chits for this customer
    if (updates.customerName || updates.customerPhone) {
      await Chit.updateMany(
        { customerId: chit.customerId },
        { 
          $set: { 
            customerName: updates.customerName || chit.customerName,
            customerPhone: updates.customerPhone || chit.customerPhone
          } 
        }
      );
    }
    
    res.json({ 
      success: true, 
      chit,
      message: 'Chit updated successfully' 
    });
  } catch (err) {
    console.error('Chit update error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating chit' 
    });
  }
});

// UPDATE chit status
router.patch('/:id/status', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const { status } = req.body;
    
    const validStatuses = ['active', 'completed', 'defaulted', 'cancelled', 'settled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }
    
    const chit = await Chit.findByIdAndUpdate(
      req.params.id,
      { $set: { status, updatedAt: new Date() } },
      { new: true }
    );
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }
    
    // Update customer stats based on status change
    let customerUpdate = {};
    if (status === 'active' && chit.status !== 'active') {
      customerUpdate.$inc = { 
        'chitDetails.activeChits': 1,
        'chitDetails.completedChits': chit.status === 'completed' ? -1 : 0,
        'chitDetails.defaultedChits': chit.status === 'defaulted' ? -1 : 0,
        'chitDetails.settledChits': chit.status === 'settled' ? -1 : 0
      };
    } else if (status === 'completed' && chit.status === 'active') {
      customerUpdate.$inc = { 
        'chitDetails.completedChits': 1,
        'chitDetails.activeChits': -1
      };
    } else if (status === 'defaulted' && chit.status === 'active') {
      customerUpdate.$inc = { 
        'chitDetails.defaultedChits': 1,
        'chitDetails.activeChits': -1
      };
    } else if (status === 'settled' && chit.status === 'completed') {
      customerUpdate.$inc = { 
        'chitDetails.settledChits': 1,
        'chitDetails.completedChits': -1
      };
    }
    
    if (Object.keys(customerUpdate).length > 0) {
      await updateCustomerChitStats(chit.customerId, customerUpdate);
    }
    
    res.json({ 
      success: true, 
      chit,
      message: 'Chit status updated successfully' 
    });
  } catch (err) {
    console.error('Chit status update error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating chit status' 
    });
  }
});

// DELETE chit
router.delete('/:id', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const chit = await Chit.findById(req.params.id);
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }
    
    // Delete associated payments
    await ChitPayment.deleteMany({ chitId: chit._id });
    
    // Update customer stats
    const customerUpdate = {
      $inc: { 
        'chitDetails.totalChits': -1,
        'chitDetails.activeChits': chit.status === 'active' ? -1 : 0,
        'chitDetails.completedChits': chit.status === 'completed' ? -1 : 0,
        'chitDetails.defaultedChits': chit.status === 'defaulted' ? -1 : 0,
        'chitDetails.settledChits': chit.status === 'settled' ? -1 : 0,
        'chitDetails.totalInvestment': -chit.chitAmount,
        'chitDetails.totalPaid': -(chit.paidInstallments * chit.installmentAmount),
        'chitDetails.totalGoldWeight': -(chit.accumulatedGold?.totalWeight || 0)
      }
    };
    
    await updateCustomerChitStats(chit.customerId, customerUpdate);
    
    await Chit.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Chit deleted successfully' 
    });
  } catch (err) {
    console.error('Chit delete error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting chit' 
    });
  }
});

// SETTLE chit - UPDATED: Added settlementGoldRate
router.post('/:id/settle', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const { 
      settlementType = 'cash', 
      settlementAmount = 0, 
      settlementDate,
      settlementGoldRate // Gold rate at settlement time
    } = req.body;

    const chit = await Chit.findById(req.params.id);
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }

    if (chit.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Chit must be completed before settlement' 
      });
    }

    // Validate gold rate for gold settlements
    if ((settlementType === 'gold' || settlementType === 'partial_gold') && !settlementGoldRate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Settlement gold rate is required for gold settlements' 
      });
    }

    // Calculate settlement amount for gold settlements
    let finalSettlementAmount = settlementAmount;
    if ((settlementType === 'gold' || settlementType === 'partial_gold') && 
        settlementGoldRate && chit.accumulatedGold.totalWeight) {
      finalSettlementAmount = chit.accumulatedGold.totalWeight * settlementGoldRate;
    }

    // Update chit with settlement details
    chit.settlementType = settlementType;
    chit.settlementAmount = finalSettlementAmount;
    chit.settlementDate = settlementDate ? new Date(settlementDate) : new Date();
    chit.settlementGoldRate = settlementGoldRate; // Store settlement gold rate
    chit.settlementStatus = 'completed';
    chit.status = 'settled';
    chit.updatedAt = new Date();

    await chit.save();

    // Update customer stats
    const customerUpdate = {
      $inc: { 
        'chitDetails.settledChits': 1,
        'chitDetails.completedChits': -1
      }
    };
    
    // Add settlement type specific stats
    if (settlementType === 'cash') {
      customerUpdate.$inc['chitDetails.cashSettlements'] = 1;
    } else if (settlementType === 'gold' || settlementType === 'partial_gold') {
      customerUpdate.$inc['chitDetails.goldSettlements'] = 1;
    } else if (settlementType === 'purchase_settlement' || settlementType === 'chit_settlement') {
      customerUpdate.$inc['chitDetails.purchaseSettlements'] = 1;
    }
    
    await updateCustomerChitStats(chit.customerId, customerUpdate);

    res.json({ 
      success: true, 
      chit,
      message: 'Chit settled successfully' 
    });
  } catch (err) {
    console.error('Chit settlement error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while processing settlement' 
    });
  }
});

// SETTLE chit for purchase
router.post('/:id/settle-purchase', async (req, res) => {
  try {
    // Validate chit ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chit ID'
      });
    }
    
    const { 
      purchaseAmount, 
      invoiceNumber, 
      items = [],
      settlementType = 'purchase_settlement',
      settlementDate,
      settlementGoldRate // Gold rate at settlement time
    } = req.body;

    const chit = await Chit.findById(req.params.id);
    
    if (!chit) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chit not found' 
      });
    }

    // Check if chit is completed
    if (chit.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Chit must be completed before settling for purchase' 
      });
    }

    // Update chit with purchase settlement details
    chit.settlementType = settlementType;
    chit.settlementAmount = purchaseAmount;
    chit.settlementDate = settlementDate ? new Date(settlementDate) : new Date();
    chit.settlementGoldRate = settlementGoldRate; // Store settlement gold rate
    chit.purchaseInvoiceNumber = invoiceNumber;
    chit.purchaseItems = items;
    chit.status = 'settled';
    chit.settlementStatus = 'completed';
    chit.notes = chit.notes ? `${chit.notes}\nSettled for purchase - Invoice: ${invoiceNumber}` : `Settled for purchase - Invoice: ${invoiceNumber}`;
    chit.updatedAt = new Date();

    await chit.save();

    // Update customer stats
    const customerUpdate = {
      $inc: { 
        'chitDetails.settledChits': 1,
        'chitDetails.completedChits': -1,
        'chitDetails.purchaseSettlements': 1
      }
    };
    
    await updateCustomerChitStats(chit.customerId, customerUpdate);

    res.json({
      success: true,
      message: 'Chit settled for purchase successfully',
      chit
    });
  } catch (error) {
    console.error('Settle chit for purchase error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while settling chit for purchase' 
    });
  }
});

// GET chit statistics - UPDATED: Include settled chits
router.get('/stats/summary', async (req, res) => {
  try {
    const totalChits = await Chit.countDocuments();
    const activeChits = await Chit.countDocuments({ status: 'active' });
    const completedChits = await Chit.countDocuments({ status: 'completed' });
    const settledChits = await Chit.countDocuments({ status: 'settled' });
    const defaultedChits = await Chit.countDocuments({ status: 'defaulted' });
    const cancelledChits = await Chit.countDocuments({ status: 'cancelled' });
    
    // Calculate total values including settled chits
    const stats = await Chit.aggregate([
      { $match: { status: { $in: ['active', 'completed', 'settled'] } } },
      { $group: {
        _id: null,
        totalInvestment: { $sum: '$chitAmount' },
        totalPaid: { $sum: { $multiply: ['$paidInstallments', '$installmentAmount'] } },
        totalGoldWeight: { $sum: '$accumulatedGold.totalWeight' }
      }}
    ]);

    // Get upcoming due chits (next 30 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);
    
    const upcomingDue = await Chit.countDocuments({
      status: 'active',
      nextDueDate: { $gte: today, $lte: next30Days }
    });

    // Get overdue chits
    const overdueChits = await Chit.countDocuments({
      status: 'active',
      nextDueDate: { $lt: today }
    });

    res.json({
      success: true,
      stats: {
        totalChits,
        activeChits,
        completedChits,
        settledChits, // Include settled chits in stats
        defaultedChits,
        cancelledChits,
        overdueChits,
        upcomingDue,
        totalCollection: stats[0]?.totalPaid || 0,
        pendingCollection: (stats[0]?.totalInvestment || 0) - (stats[0]?.totalPaid || 0),
        totalGoldWeight: stats[0]?.totalGoldWeight || 0
      }
    });
  } catch (err) {
    console.error('Chit stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching statistics' 
    });
  }
});

// SEARCH chits
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    
    const chits = await Chit.find({
      $or: [
        { chitNumber: { $regex: searchQuery, $options: 'i' } },
        { customerName: { $regex: searchQuery, $options: 'i' } },
        { customerPhone: { $regex: searchQuery, $options: 'i' } }
      ]
    }).limit(50);

    res.json({ 
      success: true, 
      chits 
    });
  } catch (err) {
    console.error('Chit search error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while searching chits' 
    });
  }
});

// GET chits by customer phone
router.get('/customer/:phone', async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, ''); // Clean phone number
    
    if (!phone || phone.length < 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid phone number required' 
      });
    }

    // Find chits by customer phone
    const chits = await Chit.find({
      customerPhone: { $regex: phone, $options: 'i' }
    }).sort({ status: 1, createdAt: -1 });

    res.json({ 
      success: true, 
      chits 
    });
  } catch (err) {
    console.error('Customer chits fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer chits' 
    });
  }
});

// GET completed chits by customer
router.get('/customer/:phone/completed', async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, ''); // Clean phone number
    
    if (!phone || phone.length < 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid phone number required' 
      });
    }

    // Find completed chits with gold accumulation
    const chits = await Chit.find({
      customerPhone: { $regex: phone, $options: 'i' },
      status: 'completed',
      'accumulatedGold.totalWeight': { $gt: 0 }
    }).sort({ chitNumber: -1 });

    res.json({ 
      success: true, 
      chits 
    });
  } catch (err) {
    console.error('Completed chits fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching completed chits' 
    });
  }
});

module.exports = router;