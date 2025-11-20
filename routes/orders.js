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

    // Process items to include weight data from products
    const processedItems = await Promise.all(
      req.body.items.map(async (item) => {
        try {
          // Fetch product details to get weight data
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
              metalWeight: product.weight || 0, // ADDED: from product
              stoneWeight: product.stoneWeight || 0, // ADDED: from product
              netWeight: product.netWeight || 0, // ADDED: from product
            };
          } else {
            // If product not found, use item data without weights
            return {
              ...item,
              category: item.category || '',
              metal: item.metal || '',
              costPrice: item.costPrice || 0,
              metalWeight: item.metalWeight || 0,
              stoneWeight: item.stoneWeight || 0,
              netWeight: item.netWeight || 0,
            };
          }
        } catch (error) {
          console.error(`Error processing item ${item.sku}:`, error);
          // Return item with default weights if there's an error
          return {
            ...item,
            category: item.category || '',
            metal: item.metal || '',
            costPrice: item.costPrice || 0,
            metalWeight: item.metalWeight || 0,
            stoneWeight: item.stoneWeight || 0,
            netWeight: item.netWeight || 0,
          };
        }
      })
    );

    const newOrder = new Order({
      ...req.body,
      items: processedItems, // Use processed items with weight data
      orderId,
      invoiceNumber,
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
    const { page = 1, limit = 50, customer, date } = req.query;
    
    let query = {};
    
    // Filter by customer name or phone
    if (customer) {
      query['customer.name'] = { $regex: customer, $options: 'i' };
    }
    
    // Filter by date
    if (date) {
      query.date = date;
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

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    // If updating items, process them to include weight data
    let updates = { ...req.body };
    
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
            };
          }
        })
      );
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

module.exports = router;