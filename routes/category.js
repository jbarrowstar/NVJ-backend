const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product'); // ✅ Import Product model

// 📋 Get All Categories with Product Count
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find();

    // Aggregate product counts by category name
    const counts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Merge counts into categories
    const enriched = categories.map(cat => {
      const match = counts.find(c => c._id === cat.name);
      return {
        ...cat.toObject(),
        productCount: match ? match.count : 0
      };
    });

    res.json({ success: true, categories: enriched });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 🆕 Create Category
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  try {
    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    const newCategory = new Category({ name, description });
    await newCategory.save();

    res.json({ success: true, category: newCategory });
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ✏️ Update Category
router.put('/:id', async (req, res) => {
  try {
    const updated = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, category: updated });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ❌ Delete Category
router.delete('/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
