// server.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (like your site.html)
app.use(express.static(__dirname));

// Route to serve the site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'site.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Hire a Dev On Roblox site running at http://localhost:${PORT}`);
});
