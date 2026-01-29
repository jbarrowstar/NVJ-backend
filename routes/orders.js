const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Counter = require('../models/Counter');

// Helper to generate formatted IDs
async function getNextFormattedNumber(prefix, separator = '/') {
  const counter = await Counter.findOneAndUpdate(
    { name: prefix },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear();
  const padded = String(counter.value).padStart(4, '0');
  return `${prefix}${separator}${year}${separator}${padded}`;
}

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const orderId = await getNextFormattedNumber('ORD', '-');
    const invoiceNumber = await getNextFormattedNumber('INV', '/');

    // Calculate total paid from payment methods
    const totalPaid = req.body.paymentMethods 
      ? req.body.paymentMethods.reduce((sum, payment) => sum + (payment.amount || 0), 0)
      : 0;

    // Process payment methods to ensure proper structure
    const processedPaymentMethods = req.body.paymentMethods ? req.body.paymentMethods.map(payment => {
      // Ensure goldExchange object exists for Gold Exchange payments
      if (payment.method === 'Gold Exchange') {
        return {
          method: payment.method,
          amount: payment.amount,
          goldExchange: payment.goldExchange || {
            weight: 0,
            goldRatePerGram: 6000,
            calculatedAmount: payment.amount || 0
          }
        };
      }
      // Ensure chitSettlement object exists for Chit Settlement payments
      if (payment.method === 'Chit Settlement') {
        return {
          method: payment.method,
          amount: payment.amount,
          chitSettlement: payment.chitSettlement || {
            chitId: '',
            chitNumber: '',
            customerName: '',
            customerPhone: '',
            accumulatedGold: 0,
            chitAmount: 0,
            paidAmount: 0,
            currentGoldRate: req.body.chitSettlement?.goldPricePerGram || 6000,
            goldValue: 0,
            extraAmount: 0
          }
        };
      }
      return {
        ...payment,
        goldExchange: undefined, // Remove goldExchange for non-gold payments
        chitSettlement: undefined // Remove chitSettlement for non-chit payments
      };
    }) : [];

    // Process items to include weight data and additional fields from products
    const processedItems = await Promise.all(
      req.body.items.map(async (item) => {
        try {
          // Fetch product details to get weight data and additional fields
          const product = await Product.findOne({ sku: item.sku });
          
          if (product) {
            return {
              name: item.name,
              price: item.price,
              qty: item.qty,
              sku: item.sku,
              category: product.category || '',
              metal: product.metal || '',
              costPrice: product.costPrice || 0,
              metalWeight: product.weight || 0,
              stoneWeight: product.stoneWeight || 0,
              netWeight: product.netWeight || 0,
              makingCharges: product.makingCharges || 0,
              wastage: product.wastage || 0,
              stonePrice: product.stonePrice || 0,
            };
          } else {
            // If product not found, use item data without additional fields
            return {
              ...item,
              category: item.category || '',
              metal: item.metal || '',
              costPrice: item.costPrice || 0,
              metalWeight: item.metalWeight || 0,
              stoneWeight: item.stoneWeight || 0,
              netWeight: item.netWeight || 0,
              makingCharges: item.makingCharges || 0,
              wastage: item.wastage || 0,
              stonePrice: item.stonePrice || 0,
            };
          }
        } catch (error) {
          console.error(`Error processing item ${item.sku}:`, error);
          // Return item with default values if there's an error
          return {
            ...item,
            category: item.category || '',
            metal: item.metal || '',
            costPrice: item.costPrice || 0,
            metalWeight: item.metalWeight || 0,
            stoneWeight: item.stoneWeight || 0,
            netWeight: item.netWeight || 0,
            makingCharges: item.makingCharges || 0,
            wastage: item.wastage || 0,
            stonePrice: item.stonePrice || 0,
          };
        }
      })
    );

    // Calculate gold value and extra amount for chit settlements
    const processedPaymentMethodsWithCalculations = processedPaymentMethods.map(payment => {
      if (payment.method === 'Chit Settlement' && payment.chitSettlement) {
        const chitData = payment.chitSettlement;
        const goldRate = chitData.currentGoldRate || req.body.chitSettlement?.goldPricePerGram || 6000;
        const goldWeight = chitData.accumulatedGold || 0;
        const goldValue = goldWeight * goldRate;
        const extraAmount = payment.amount - goldValue;
        
        return {
          ...payment,
          chitSettlement: {
            ...chitData,
            currentGoldRate: goldRate,
            goldValue: goldValue,
            extraAmount: extraAmount > 0 ? extraAmount : 0,
            remainingAmount: (chitData.chitAmount || 0) - (chitData.paidAmount || 0) - payment.amount
          }
        };
      }
      return payment;
    });

    const newOrder = new Order({
      ...req.body,
      items: processedItems, // Use processed items with all data
      paymentMethods: processedPaymentMethodsWithCalculations, // Use processed payment methods with calculations
      orderId,
      invoiceNumber,
      // Include chit settlement data if provided
      chitSettlement: req.body.chitSettlement ? {
        ...req.body.chitSettlement,
        goldPricePerGram: req.body.chitSettlement.goldPricePerGram || 6000
      } : undefined,
      // Set paymentMode for backward compatibility (use first method or 'Multiple')
      paymentMode: req.body.paymentMethods && req.body.paymentMethods.length > 0 
        ? req.body.paymentMethods.length === 1 
          ? req.body.paymentMethods[0].method 
          : 'Multiple'
        : req.body.paymentMode || 'Multiple'
    });

    await newOrder.save();

    // Update stock for each item
    for (const item of req.body.items) {
      await Product.findOneAndUpdate(
        { sku: item.sku },
        { $inc: { stock: -item.qty } },
        { new: true }
      );
    }

    res.json({ 
      success: true, 
      order: newOrder,
      message: `Order created successfully. Total paid: ₹${totalPaid.toLocaleString()}`
    });
  } catch (err) {
    console.error('Order save error:', err);
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID or Invoice Number already exists' 
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
      message: 'Server error while creating order' 
    });
  }
});

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, customer, date, paymentMethod } = req.query;
    
    let query = {};
    
    // Filter by customer name or phone
    if (customer) {
      query['customer.name'] = { $regex: customer, $options: 'i' };
    }
    
    // Filter by date
    if (date) {
      query.date = date;
    }
    
    // Filter by payment method
    if (paymentMethod) {
      query['paymentMethods.method'] = paymentMethod;
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Order.countDocuments(query);
    
    res.json({ 
      success: true, 
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching orders' 
    });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    res.json({ 
      success: true, 
      order 
    });
  } catch (err) {
    console.error('Order fetch error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid order ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching order' 
    });
  }
});

// GET /api/orders/invoice/:invoiceNumber
router.get('/invoice/:invoiceNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ 
      invoiceNumber: req.params.invoiceNumber 
    });
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }
    
    res.json({ 
      success: true, 
      order 
    });
  } catch (err) {
    console.error('Invoice fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching invoice' 
    });
  }
});

// GET /api/orders/customer/:phone
router.get('/customer/:phone', async (req, res) => {
  try {
    const orders = await Order.find({ 
      'customer.phone': req.params.phone 
    }).sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      orders,
      total: orders.length 
    });
  } catch (err) {
    console.error('Customer orders fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching customer orders' 
    });
  }
});

// GET /api/orders/chit/:chitNumber
router.get('/chit/:chitNumber', async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { 'paymentMethods.chitSettlement.chitNumber': req.params.chitNumber },
        { 'chitSettlement.chitNumber': req.params.chitNumber }
      ]
    }).sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      orders,
      total: orders.length 
    });
  } catch (err) {
    console.error('Chit orders fetch error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching chit orders' 
    });
  }
});

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    // If updating payment methods, process them properly
    let updates = { ...req.body };
    
    if (req.body.paymentMethods) {
      updates.paymentMethods = req.body.paymentMethods.map(payment => {
        if (payment.method === 'Gold Exchange') {
          return {
            method: payment.method,
            amount: payment.amount,
            goldExchange: payment.goldExchange || {
              weight: 0,
              goldRatePerGram: 6000,
              calculatedAmount: payment.amount || 0
            }
          };
        }
        if (payment.method === 'Chit Settlement') {
          return {
            method: payment.method,
            amount: payment.amount,
            chitSettlement: payment.chitSettlement || {
              chitId: '',
              chitNumber: '',
              customerName: '',
              customerPhone: '',
              accumulatedGold: 0,
              chitAmount: 0,
              paidAmount: 0,
              currentGoldRate: req.body.chitSettlement?.goldPricePerGram || 6000
            }
          };
        }
        return {
          ...payment,
          goldExchange: undefined,
          chitSettlement: undefined
        };
      });
    }
    
    // If updating items, process them to include weight data and additional fields
    if (req.body.items) {
      updates.items = await Promise.all(
        req.body.items.map(async (item) => {
          try {
            const product = await Product.findOne({ sku: item.sku });
            
            if (product) {
              return {
                name: item.name,
                price: item.price,
                qty: item.qty,
                sku: item.sku,
                category: product.category || '',
                metal: product.metal || '',
                costPrice: product.costPrice || 0,
                metalWeight: product.weight || 0,
                stoneWeight: product.stoneWeight || 0,
                netWeight: product.netWeight || 0,
                makingCharges: product.makingCharges || 0,
                wastage: product.wastage || 0,
                stonePrice: product.stonePrice || 0,
              };
            } else {
              return {
                ...item,
                category: item.category || '',
                metal: item.metal || '',
                costPrice: item.costPrice || 0,
                metalWeight: item.metalWeight || 0,
                stoneWeight: item.stoneWeight || 0,
                netWeight: item.netWeight || 0,
                makingCharges: item.makingCharges || 0,
                wastage: item.wastage || 0,
                stonePrice: item.stonePrice || 0,
              };
            }
          } catch (error) {
            console.error(`Error processing item ${item.sku}:`, error);
            return {
              ...item,
              category: item.category || '',
              metal: item.metal || '',
              costPrice: item.costPrice || 0,
              metalWeight: item.metalWeight || 0,
              stoneWeight: item.stoneWeight || 0,
              netWeight: item.netWeight || 0,
              makingCharges: item.makingCharges || 0,
              wastage: item.wastage || 0,
              stonePrice: item.stonePrice || 0,
            };
          }
        })
      );
    }

    // Calculate gold value and extra amount for chit settlements in updates
    if (updates.paymentMethods) {
      updates.paymentMethods = updates.paymentMethods.map(payment => {
        if (payment.method === 'Chit Settlement' && payment.chitSettlement) {
          const chitData = payment.chitSettlement;
          const goldRate = chitData.currentGoldRate || updates.chitSettlement?.goldPricePerGram || 6000;
          const goldWeight = chitData.accumulatedGold || 0;
          const goldValue = goldWeight * goldRate;
          const extraAmount = payment.amount - goldValue;
          
          return {
            ...payment,
            chitSettlement: {
              ...chitData,
              currentGoldRate: goldRate,
              goldValue: goldValue,
              extraAmount: extraAmount > 0 ? extraAmount : 0,
              remainingAmount: (chitData.chitAmount || 0) - (chitData.paidAmount || 0) - payment.amount
            }
          };
        }
        return payment;
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // If updating chit settlement, update the top-level chitSettlement field
    if (req.body.chitSettlement) {
      order.chitSettlement = {
        ...req.body.chitSettlement,
        goldPricePerGram: req.body.chitSettlement.goldPricePerGram || 6000
      };
      await order.save();
    }
    
    res.json({ 
      success: true, 
      order,
      message: 'Order updated successfully' 
    });
  } catch (err) {
    console.error('Order update error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid order ID' 
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
      message: 'Server error while updating order' 
    });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Restore stock for each item
    for (const item of order.items) {
      await Product.findOneAndUpdate(
        { sku: item.sku },
        { $inc: { stock: item.qty } },
        { new: true }
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Order deleted successfully' 
    });
  } catch (err) {
    console.error('Order delete error:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid order ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting order' 
    });
  }
});

// GET /api/orders/summary/daily
router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }
    
    const orders = await Order.find({ date: date });
    
    const summary = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, order) => sum + order.grandTotal, 0),
      paymentMethods: {},
      chitSettlements: orders.filter(order => 
        order.paymentMethods?.some(p => p.method === 'Chit Settlement')
      ).length,
      goldExchanges: orders.filter(order => 
        order.paymentMethods?.some(p => p.method === 'Gold Exchange')
      ).length
    };
    
    // Calculate payment method breakdown
    orders.forEach(order => {
      order.paymentMethods?.forEach(payment => {
        const method = payment.method;
        if (!summary.paymentMethods[method]) {
          summary.paymentMethods[method] = 0;
        }
        summary.paymentMethods[method] += payment.amount;
      });
    });
    
    res.json({
      success: true,
      summary,
      date
    });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching daily summary'
    });
  }
});

// GET /api/orders/search
router.get('/search', async (req, res) => {
  try {
    const { q, startDate, endDate, limit = 20 } = req.query;
    
    let query = {};
    
    if (q) {
      const searchRegex = { $regex: q, $options: 'i' };
      query.$or = [
        { invoiceNumber: searchRegex },
        { orderId: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.phone': searchRegex },
        { 'customer.email': searchRegex },
        { 'items.name': searchRegex },
        { 'items.sku': searchRegex },
        { 'chitSettlement.chitNumber': searchRegex }
      ];
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      orders,
      total: orders.length
    });
  } catch (err) {
    console.error('Order search error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while searching orders'
    });
  }
});

module.exports = router;