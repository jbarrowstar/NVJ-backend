const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { getNextSequence } = require('../utils/counterHelper');

const multer = require('multer');
const path = require('path');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

require('dotenv').config();

// S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer configuration
const allowedExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedExt.has(ext)) cb(null, true);
  else cb(new Error('Unsupported file type'), false);
};

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, 
});

// Helpers
const safeKey = (originalName) => {
  const base = (originalName || 'upload')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_\-\.]/g, '');
  const datePrefix = new Date().toISOString().slice(0, 10);
  const ts = Date.now();
  return `uploads/${datePrefix}/${ts}-${base}`;
};

async function uploadBufferToS3({ buffer, key, contentType }) {
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      ACL: 'private',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
  });
  await uploader.done();
  return {
    key,
    url: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  };
}

// Image upload endpoint
router.post('/upload', uploadMemory.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const key = safeKey(req.file.originalname);
    const { url } = await uploadBufferToS3({
      buffer: req.file.buffer,
      key,
      contentType: req.file.mimetype,
    });
    return res.json({ success: true, imageUrl: url, key });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// Multiple images upload
router.post('/upload-multiple', uploadMemory.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const uploads = await Promise.all(
      req.files.map((f) => {
        const key = safeKey(f.originalname);
        return uploadBufferToS3({
          buffer: f.buffer,
          key,
          contentType: f.mimetype,
        });
      })
    );
    return res.json({
      success: true,
      images: uploads.map(u => ({ imageUrl: u.url, key: u.key })),
      count: uploads.length,
    });
  } catch (err) {
    console.error('Multi upload error:', err);
    return res.status(500).json({ success: false, message: 'Images upload failed' });
  }
});

// List all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Fetch single product by id
router.get('/:id', async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: prod });
  } catch (err) {
    console.error('Product fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Fetch by SKU
router.get('/sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const prod = await Product.findOne({ sku });
    if (!prod) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: prod });
  } catch (err) {
    console.error('Product fetch by SKU error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// SKU generation helpers
const getYyyymm = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
};

const sanitizeCategoryPrefix = (category = '') => {
  const clean = String(category || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const prefix = clean.slice(0, 3);
  return prefix.length === 3 ? prefix : (prefix + 'GEN').slice(0, 3);
};

// Create product with stone weight and net weight
router.post('/', async (req, res) => {
  try {
    const {
      name, category, metal, weight, stoneWeight, netWeight, purity, makingCharges, wastage, stonePrice, price, description, image,
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'Name and category are required' });
    }

    const prefix = sanitizeCategoryPrefix(category);
    const yyyymm = getYyyymm();
    const counterName = `SKU_${prefix}_${yyyymm}`;
    const seq = await getNextSequence(counterName);
    const serial = String(seq).padStart(4, '0');
    const sku = `${prefix}-${yyyymm}-${serial}`;
    const qrCode = `QR-${sku}`;

    // Calculate net weight if not provided
    const calculatedNetWeight = netWeight || (() => {
      const metalWt = parseFloat(weight || '0') || 0;
      const stoneWt = parseFloat(stoneWeight || '0') || 0;
      return (metalWt + stoneWt).toFixed(2);
    })();

    const payload = {
      name,
      category,
      metal: metal || 'gold',
      weight: weight || '',
      stoneWeight: stoneWeight || '',
      netWeight: calculatedNetWeight,
      purity: purity || '',
      makingCharges: makingCharges ?? 0,
      wastage: wastage ?? 0,
      stonePrice: stonePrice ?? 0,
      price: price ?? 0,
      description: description || '',
      image: image || '',
      sku,
      qrCode,
    };

    const product = new Product(payload);
    await product.save();

    return res.json({ success: true, product });
  } catch (err) {
    console.error('Product create error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    
    // Ensure net weight is calculated if weight or stoneWeight is updated
    if (updates.weight !== undefined || updates.stoneWeight !== undefined) {
      const metalWeight = parseFloat(updates.weight || '0') || 0;
      const stoneWeight = parseFloat(updates.stoneWeight || '0') || 0;
      updates.netWeight = (metalWeight + stoneWeight).toFixed(2);
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { 
      new: true, 
      runValidators: true 
    });
    
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, product: updated });
  } catch (err) {
    console.error('Product update error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).json({ success: false, message: 'Product not found' });

    // Delete S3 image if exists
    if (prod.image && typeof prod.image === 'string' && prod.image.includes('.s3.')) {
      const key = new URL(prod.image).pathname.replace(/^\//, '');
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
        }));
      } catch (e) {
        console.error('Failed to delete S3 object:', e);
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Product delete error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mark as sold
router.put('/:sku/mark-sold', async (req, res) => {
  try {
    await Product.findOneAndUpdate({ sku: req.params.sku }, { available: false });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark sold error:', err);
    res.status(500).json({ success: false });
  }
});

// Search products
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Query parameter is required' });
    }

    const products = await Product.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
      ]
    }).sort({ createdAt: -1 });

    res.json({ success: true, products });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get product stats
router.get('/stats', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const goldProducts = await Product.countDocuments({ metal: 'gold' });
    const silverProducts = await Product.countDocuments({ metal: 'silver' });
    const outOfStock = await Product.countDocuments({ available: false });

    res.json({
      success: true,
      stats: {
        totalProducts,
        goldProducts,
        silverProducts,
        outOfStock,
      }
    });
  } catch (err) {
    console.error('Product stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update product availability
router.patch('/:id/availability', async (req, res) => {
  try {
    const { available } = req.body;
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { available },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, product: updated });
  } catch (err) {
    console.error('Product availability update error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;