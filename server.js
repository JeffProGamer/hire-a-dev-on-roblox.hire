// server.js
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const RobloxStrategy = require("passport-roblox").Strategy;
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Passport config
// =======================
passport.use(new RobloxStrategy({
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.ROBLOX_CALLBACK_URL,
  scope: "openid profile"
}, (accessToken, refreshToken, profile, done) => {
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
// Middleware
// =======================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, "public")));

// =======================
// Auth guard
// =======================
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

// =======================
// Routes
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Terms & Privacy
app.get("/terms.html", (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/privacy.html", (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));

// =======================
// OAuth
// =======================
app.get("/api/oauth/roblox", passport.authenticate("roblox"));

app.get("/api/oauth/callback",
  passport.authenticate("roblox", { failureRedirect: "/" }),
  (req, res) => res.redirect("/") // redirect to React dashboard
);

// Logout
app.get("/api/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// =======================
// API routes
// =======================
app.get("/api/me", requireAuth, (req, res) => res.json(req.user));

app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const response = await fetch(`https://friends.roblox.com/v1/users/${req.user.id}/friends`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

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
// Start server
// =======================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
