const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = 3000;

// ===============================
// 1. Redirect user to Roblox OAuth
// ===============================
app.get('/login', (req, res) => {
  const authUrl = `https://authorize.roblox.com/?client_id=${process.env.ROBLOX_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.CALLBACK_URL)}&scope=openid+profile`;
  res.redirect(authUrl);
});

// ===============================
// 2. Handle callback with ?code=...
// ===============================
app.get('/api/oauth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    // Exchange code for token
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', process.env.ROBLOX_CLIENT_ID);
    params.append('client_secret', process.env.ROBLOX_CLIENT_SECRET);
    params.append('redirect_uri', process.env.CALLBACK_URL);

    const tokenRes = await axios.post('https://auth.roblox.com/v2/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenRes.data.access_token;

    // Fetch user info directly (no storing)
    const userRes = await axios.get('https://users.roblox.com/v1/users/authenticated', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // Show Roblox user info
    res.json({
      success: true,
      user: userRes.data,
      access_token: accessToken // ⚠️ only for testing, remove in production
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('OAuth failed');
  }
});

// ===============================
// 3. Start server
// ===============================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

