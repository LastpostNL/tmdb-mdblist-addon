require('dotenv').config();
const addon = require('./index.js');  // addon is Express app
const cors = require('cors');

const PORT = process.env.PORT || 1337;

// Middleware toevoegen vóór het starten van de server
addon.use(cors());

addon.listen(PORT, function () {
  console.log(`Addon active on port ${PORT}.`);
  console.log(`http://127.0.0.1:${PORT}/`);
  console.log("TMDB_API_KEY:", process.env.TMDB_API_KEY);
});