require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const addon = require('./index.js');  // addon is Express app

const PORT = process.env.PORT || 1337;

// Middleware
addon.use(cors());

// 🔽 Static frontend build van configure/
const frontendPath = path.join(__dirname, '..', 'configure', 'dist');
addon.use(express.static(frontendPath));

// 🔽 Alle niet-herkende routes verwijzen naar index.html (SPA fallback)
addon.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start server
addon.listen(PORT, function () {
  console.log(`Addon active on port ${PORT}.`);
  console.log(`http://127.0.0.1:${PORT}/`);
  console.log("TMDB_API_KEY:", process.env.TMDB_API_KEY);
});
