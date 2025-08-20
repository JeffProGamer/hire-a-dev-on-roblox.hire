// server.js
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();

// security + performance
app.use(helmet());
app.use(compression());

// session (secure cookies in prod)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,            // force HTTPS
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Roblox OAuth2 Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://apis.roblox.com/oauth/v1/authorize',
  tokenURL: 'https://apis.roblox.com/oauth/v1/token',
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['openid', 'profile'],
  state: true
}, async (accessToken, refreshToken, params, done) => {
  try {
    const res = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const u = res.data;
    done(null, {
      id: u.sub,
      username: u.preferred_username,
      displayName: u.name,
      avatar: u.picture,
      accessToken,
      refreshToken
    });
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// OAuth routes
app.get('/api/oauth/roblox', passport.authenticate('oauth2'));

app.get('/api/oauth/callback',
  passport.authenticate('oauth2', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.user);
});

app.get('/api/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// static frontend
app.use(express.static('public'));

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (production)`));
