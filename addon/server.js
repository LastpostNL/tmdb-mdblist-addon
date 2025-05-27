// addon/server.js
require('dotenv').config();
const path    = require('path');
const express = require('express'); // enkel voor static-serving
const cors    = require('cors');

const addon   = require('./index.js'); // JOUW EXPRESS-APP

const PORT = process.env.PORT || 1337;

// Globale CORS (kan ook in index.js, maar hier kan het gerust dubbel staan)
addon.use(cors());

// Serve de configure-SPA
const frontendPath = path.join(__dirname, '..', 'configure', 'dist');
addon.use(express.static(frontendPath));

// SPA fallback voor alle niet-herkende GET-routes
addon.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Én Nederlandse luister-aanroep
addon.listen(PORT, () => {
  console.log(`Addon running on http://localhost:${PORT}`);
});
