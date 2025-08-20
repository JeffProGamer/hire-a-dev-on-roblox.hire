// server.js
const express = require("express");
const path = require("path");
const fetch = require("node-fetch"); // Make sure to install: npm install node-fetch
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (site.html, css, js, etc.)
app.use(express.static(__dirname));

// Main route -> site.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "site.html"));
});

/**
 * Roblox OAuth Endpoint
 * Exchange OAuth token for user info
 */
app.get("/api/oauth/roblox", async (req, res) => {
  try {
    const accessToken = req.query.token; // passed from frontend after login
    if (!accessToken) {
      return res.status(400).json({ error: "Missing access token" });
    }

    // Get Roblox user info
    const userRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      return res
        .status(userRes.status)
        .json({ error: "Failed to fetch user info", details: errorText });
    }

    const userInfo = await userRes.json();

    // Extract userId from Roblox sub field (e.g., "users/123456")
    const userId = userInfo.sub?.split("/")[1];
    if (!userId) {
      return res.status(500).json({ error: "Could not parse userId" });
    }

    // Get display name & avatar
    const [profileRes, avatarRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`),
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`
      ),
    ]);

    const profile = await profileRes.json();
    const avatar = await avatarRes.json();

    return res.json({
      userId,
      username: profile.name,
      displayName: profile.displayName,
      avatar:
        avatar.data && avatar.data[0] ? avatar.data[0].imageUrl : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
