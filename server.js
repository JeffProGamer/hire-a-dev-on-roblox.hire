const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const axiosRetry = require('axios-retry');
const path = require('path');
require('dotenv').config();

const app = express();

// Configure axios-retry for Roblox API rate limits
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secure_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// Roblox OAuth2 Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://auth.roblox.com/v2/authorize',
  tokenURL: 'https://auth.roblox.com/v2/token',
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'https://mc-6vj2.onrender.com/api/oauth/callback',
  scope: ['user.identity']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const userResponse = await axios.get('https://users.roblox.com/v1/users/authenticated', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = userResponse.data;
    const userProfile = {
      id: userData.id,
      username: userData.name,
      displayName: userData.displayName,
      avatar: `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userData.id}&size=150x150&format=Png`
    };
    return done(null, userProfile);
  } catch (err) {
    console.error('Error fetching user profile:', err.message);
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Routes
app.get('/api/oauth/roblox', passport.authenticate('oauth2'));
app.get('/api/oauth/callback', passport.authenticate('oauth2', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/');
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    username: req.user.username,
    displayName: req.user.displayName,
    avatar: req.user.avatar,
    id: req.user.id
  });
});

app.get('/api/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));