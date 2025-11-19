const express = require('express');
const router = express.Router();
const Return = require('../models/Return');

// POST /api/returns
router.post('/', async (req, res) => {
  try {
    const newReturn = new Return(req.body);
    await newReturn.save();
    res.json({ success: true, return: newReturn });
  } catch (err) {
    console.error('Return save error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/returns
router.get('/', async (req, res) => {
  try {
    const returns = await Return.find().sort({ createdAt: -1 });
    res.json({ success: true, returns });
  } catch (err) {
    console.error('Return fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
