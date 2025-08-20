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
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Roblox OAuth2 Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://auth.roblox.com/v2/authorize',
  tokenURL: 'https://auth.roblox.com/v2/token',
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/api/oauth/callback',
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
    avatar: req.user.avatar
  });
});

app.get('/api/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Fetch real developers from Roblox group
app.get('/api/developers', async (req, res) => {
  try {
    const groupId = process.env.ROBLOX_GROUP_ID || 'YOUR_GROUP_ID'; // Replace with your group ID
    const response = await axios.get(`https://groups.roblox.com/v1/groups/${groupId}/users?limit=100`);
    const members = response.data.data;
    const developers = await Promise.all(members.map(async (member) => {
      const userId = member.user.userId;
      const avatarResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png`);
      return {
        id: userId,
        displayName: member.user.displayName,
        role: member.role.name, // Use group role as developer role
        avatar: avatarResponse.data.data[0]?.imageUrl || 'https://via.placeholder.com/150'
      };
    }));
    res.json(developers);
  } catch (err) {
    console.error('Error fetching developers:', err.message);
    res.status(500).json({ error: 'Failed to fetch developers' });
  }
});

// Project stats (replace with your own logic, e.g., database or Roblox API)
app.get('/api/projects/stats', async (req, res) => {
  try {
    // Example: Fetch project stats from a database or Roblox API
    // For now, returning realistic but static data (replace with real logic)
    const stats = {
      active: 5, // Replace with real count, e.g., from database
      completed: 20,
      pending: 3
    };
    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Notifications (replace with real user activity from Roblox API)
app.get('/api/notifications', async (req, res) => {
  try {
    // Example: Fetch recent user activity or group events
    // For now, returning realistic but static data (replace with real logic)
    const notifications = [
      { message: `User ${req.user?.displayName || 'Someone'} joined the project` },
      { message: 'New script submitted for review' },
      { message: 'Model upload completed' }
    ];
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));