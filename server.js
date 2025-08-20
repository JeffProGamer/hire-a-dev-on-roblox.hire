const express = require('express');
const session = require('express-session');
const passport = require('passport');
const RobloxStrategy = require('passport-roblox').Strategy;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Roblox OAuth Strategy
passport.use(new RobloxStrategy({
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/api/oauth/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Fetch additional user data from Roblox API
    const userResponse = await axios.get(`https://users.roblox.com/v1/users/${profile.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    profile.avatar = `https://thumbnails.roblox.com/v1/users/avatar?userIds=${profile.id}&size=150x150&format=Png`;
    profile.displayName = userResponse.data.displayName;
    return done(null, profile);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Routes
app.get('/api/oauth/roblox', passport.authenticate('roblox', { scope: ['user.identity'] }));
app.get('/api/oauth/callback', passport.authenticate('roblox', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/');
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    username: req.user.username,
    displayName: req.user.displayName,
    avatar: req.user.avatar
  });
});

app.get('/api/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Mock API for developers (replace with real data source)
app.get('/api/developers', (req, res) => {
  res.json([
    { id: 1, displayName: 'DevX', role: 'Scripting Expert', avatar: 'https://thumbnails.roblox.com/v1/users/avatar?userIds=1&size=150x150&format=Png' },
    { id: 2, displayName: 'BuilderY', role: '3D Modeler', avatar: 'https://thumbnails.roblox.com/v1/users/avatar?userIds=2&size=150x150&format=Png' }
  ]);
});

// Mock API for project stats
app.get('/api/projects/stats', (req, res) => {
  res.json({ active: 3, completed: 12, pending: 2 });
});

// Mock API for notifications
app.get('/api/notifications', (req, res) => {
  res.json([
    { message: 'DevX submitted a new script for review' },
    { message: 'BuilderY uploaded a new model' },
    { message: 'Payment sent to DevZ' }
  ]);
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));