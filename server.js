// server.js
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secure_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Roblox Open Cloud OAuth2 Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://apis.roblox.com/oauth/v1/authorize',
  tokenURL: 'https://apis.roblox.com/oauth/v1/token',
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/api/oauth/callback',
  scope: ['openid', 'profile']
}, async (accessToken, refreshToken, params, profile, done) => {
  try {
    // Fetch user info from Roblox Open Cloud
    const resp = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = resp.data;

    const userProfile = {
      id: user.sub,
      username: user.preferred_username,
      displayName: user.name,
      avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${user.sub}&width=150&height=150&format=png`,
      accessToken
    };

    return done(null, userProfile);
  } catch (err) {
    console.error('Error fetching user profile:', err.message);
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// OAuth routes
app.get('/api/oauth/roblox', passport.authenticate('oauth2'));
app.get('/api/oauth/callback', passport.authenticate('oauth2', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/');
});

// Current user
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    avatar: req.user.avatar
  });
});

// Logout
app.get('/api/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
