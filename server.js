// server.js (Node/Express Backend)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const cors = require('cors');

// Import routes
const { authRoutes, githubRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true 
}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sessionsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true, useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Route setup
app.use('/auth', authRoutes);
app.use('/api/github', githubRoutes);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
