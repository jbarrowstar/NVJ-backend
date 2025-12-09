const express = require('express');
const router = express.Router();
const Return = require('../models/Return');

// POST /api/returns - Create a new return
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const { orderId, returnReason, returnType, returnWeight } = req.body;
    
    if (!orderId || !returnReason || !returnType || returnWeight === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields (orderId, returnReason, returnType, returnWeight)' 
      });
    }

    const newReturn = new Return({
      ...req.body,
      status: 'Completed', // Default status
      createdAt: new Date()
    });
    
    await newReturn.save();
    
    res.status(201).json({ 
      success: true, 
      return: newReturn 
    });
  } catch (err) {
    console.error('Return save error:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: err.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating return' 
    });
  }
});

// GET /api/returns - Get all returns
router.get('/', async (req, res) => {
  try {
    const returns = await Return.find().sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      returns,
      count: returns.length 
    });
  } catch (err) {
    console.error('Return fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching returns' 
    });
  }
});

// GET /api/returns/:id - Get return by ID
router.get('/:id', async (req, res) => {
  try {
    const returnDoc = await Return.findById(req.params.id);
    
    if (!returnDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'Return not found' 
      });
    }
    
    res.json({ 
      success: true, 
      return: returnDoc 
    });
  } catch (err) {
    console.error('Fetch return by ID error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid return ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching return' 
    });
  }
});

// DELETE /api/returns/:id - Delete a return
router.delete('/:id', async (req, res) => {
  try {
    const deletedReturn = await Return.findByIdAndDelete(req.params.id);
    
    if (!deletedReturn) {
      return res.status(404).json({ 
        success: false, 
        message: 'Return not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Return deleted successfully' 
    });
  } catch (err) {
    console.error('Delete return error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid return ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting return' 
    });
  }
});

// PATCH /api/returns/:id/status - Update return status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status is required' 
      });
    }
    
    const updatedReturn = await Return.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    
    if (!updatedReturn) {
      return res.status(404).json({ 
        success: false, 
        message: 'Return not found' 
      });
    }
    
    res.json({ 
      success: true, 
      return: updatedReturn 
    });
  } catch (err) {
    console.error('Update return status error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid return ID' 
      });
    }
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: err.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating return status' 
    });
  }
});

// GET /api/returns/stats - Get returns statistics
router.get('/stats', async (req, res) => {
  try {
    const totalReturns = await Return.countDocuments();
    const returns = await Return.find();
    
    const totalRefundAmount = returns.reduce((sum, ret) => sum + (ret.grandTotal || 0), 0);
    const pendingReturns = await Return.countDocuments({ status: 'Pending' });
    const completedReturns = await Return.countDocuments({ status: 'Completed' });
    
    res.json({
      success: true,
      stats: {
        totalReturns,
        totalRefundAmount,
        pendingReturns,
        completedReturns,
      }
    });
  } catch (err) {
    console.error('Fetch returns stats error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching return statistics' 
    });
  }
});

// GET /api/returns/check/:orderId - Check if return exists for an order
router.get('/check/:orderId', async (req, res) => {
  try {
    const returnDoc = await Return.findOne({ orderId: req.params.orderId });
    
    res.json({
      success: true,
      exists: !!returnDoc,
      return: returnDoc || null
    });
  } catch (err) {
    console.error('Return check error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while checking return' 
    });
  }
});

module.exports = router;