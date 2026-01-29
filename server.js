require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db/connect'); // ✅ Modular Atlas connection

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const returnRoutes = require('./routes/returns');
const categoryRoutes = require('./routes/category');
const rateRoutes = require('./routes/rates');

// Add these imports for chits
const chitRoutes = require('./routes/chits');
const chitPaymentRoutes = require('./routes/chitPayments');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Use modular connection (Atlas or local via .env)
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/chits', chitRoutes);
app.use('/api/chit-payments', chitPaymentRoutes);

app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 3001;
app.listen(PORT,"0.0.0.0", () => console.log(`🚀 Backend running on port ${PORT}`));