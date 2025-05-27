// addon/server.js
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');

// Hier laden we jouw addon/app als een ‘Router’
const addon = require('./index.js');

const PORT = process.env.PORT || 1337;

// Algemeen
addon.use(cors());

// Serveer de frontend voor /configure
const frontendPath = path.join(__dirname, '..', 'configure', 'dist');
addon.use(express.static(frontendPath));

// Fallback voor SPA
addon.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Pas nú starten we de server
addon.listen(PORT, () => {
  console.log(`🖥️  Addon listening on http://localhost:${PORT}`);
});
