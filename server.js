// server.js
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const RobloxStrategy = require("passport-roblox").Strategy;
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

// =======================
// PASSPORT CONFIG
// =======================
passport.use(new RobloxStrategy({
  clientID: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  callbackURL: "http://localhost:3000/api/oauth/callback",
  scope: "openid profile"
}, (accessToken, refreshToken, profile, done) => {
  // Save the Roblox profile in session
  return done(null, {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${profile.id}&width=150&height=150&format=png`
  });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// =======================
// MIDDLEWARE
// =======================
app.use(session({
  secret: "super-secret-key",
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// =======================
// AUTH GUARD
// =======================
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

// =======================
// ROUTES
// =======================

// --- Login page ---
app.get("/", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/dashboard");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-950 flex items-center justify-center h-screen text-white">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-6">Hire Devs On Roblox</h1>
        <a href="/api/oauth/roblox" 
           class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
          Login with Roblox
        </a>
      </div>
    </body>
    </html>
  `);
});

// --- Dashboard ---
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// --- OAuth ---
app.get("/api/oauth/roblox", passport.authenticate("roblox"));
app.get("/api/oauth/callback",
  passport.authenticate("roblox", { failureRedirect: "/" }),
  (req, res) => res.redirect("/dashboard")
);

// --- Logout ---
app.get("/api/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// =======================
// API ROUTES
// =======================

// Current user
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// Friends
app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const response = await fetch(`https://friends.roblox.com/v1/users/${req.user.id}/friends`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Badges
app.get("/api/badges", requireAuth, async (req, res) => {
  try {
    const response = await fetch(`https://badges.roblox.com/v1/users/${req.user.id}/badges?limit=10&sortOrder=Desc`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// =======================
// START
// =======================
app.listen(PORT, () => console.log(`✅ Server running: http://localhost:${PORT}`));
