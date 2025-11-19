const express = require('express');
const router = express.Router();
const Rate = require('../models/Rate');
const Product = require('../models/Product');

function computePriceForProduct(rate, weight, wastage = 0, makingCharges = 0, stonePrice = 0) {
  const w = parseFloat(weight || '0') || 0;
  const wastageAmount = (w * rate * wastage) / 100;
  return Math.round(w * rate + wastageAmount + makingCharges + stonePrice);
}

// GET all rates
router.get('/', async (req, res) => {
  try {
    const rates = await Rate.find().sort({ metal: 1, purity: 1 });
    res.json({ success: true, rates });
  } catch (err) {
    console.error('Rates fetch error:', err);
    res.status(500).json({ success: false, message: 'Error fetching rates' });
  }
});

// PUT update rate by metal and optional purity
router.put('/:metal', async (req, res) => {
  const { metal } = req.params;
  const { price, purity } = req.body;

  console.log('Incoming rate update:', { metal, price, purity });

  if (typeof price !== 'number' || isNaN(price)) {
    return res.status(400).json({ success: false, message: 'Invalid price' });
  }

  try {
    const validPurities = ['24K', '22K', '18K'];
    const normalizedPurity =
      metal === 'silver' ? null : validPurities.includes(purity) ? purity : '22K';

    const query = { metal, purity: normalizedPurity };
    const update = {
      price: Number(price),
      updatedAt: new Date(),
      purity: normalizedPurity,
    };

    const updatedRate = await Rate.findOneAndUpdate(query, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    let updatedCount = 0;

    const productFilter = { metal };
    if (normalizedPurity) productFilter.purity = normalizedPurity;

    const products = await Product.find(productFilter).select(
      'weight wastage makingCharges stonePrice _id'
    );

    if (products?.length) {
      const bulkOps = products.map((p) => ({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              price: computePriceForProduct(
                Number(price),
                p.weight,
                p.wastage ?? 0,
                p.makingCharges ?? 0,
                p.stonePrice ?? 0
              ),
            },
          },
        },
      }));

      const result = await Product.bulkWrite(bulkOps);
      updatedCount = result.modifiedCount ?? result.nModified ?? 0;
    }

    res.json({ success: true, rate: updatedRate, updatedProducts: updatedCount });
  } catch (err) {
    console.error('Rate update error:', err);
    res.status(500).json({ success: false, message: 'Error updating rate' });
  }
});

// POST /api/rates/seed — optional seeding route
router.post('/seed', async (req, res) => {
  try {
    const baseRates = [
      { metal: 'gold', purity: '24K', price: 0 },
      { metal: 'gold', purity: '22K', price: 0 },
      { metal: 'gold', purity: '18K', price: 0 },
      { metal: 'silver', purity: null, price: 0 },
    ];

    for (const r of baseRates) {
      await Rate.updateOne(
        { metal: r.metal, purity: r.purity },
        { $setOnInsert: { price: r.price, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    res.json({ success: true, message: 'Rates seeded successfully' });
  } catch (err) {
    console.error('Rate seeding error:', err);
    res.status(500).json({ success: false, message: 'Error seeding rates' });
  }
});

module.exports = router;
