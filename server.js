// server.js 
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const axiosRetry = require('axios-retry');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();

// ---------- Axios retry ----------
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// ---------- Middleware ----------
app.use(express.json());
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: './db' }),
    secret: process.env.SESSION_SECRET ||
      'RBX-NYXHBUe2_UqBzSXR5zd8JwGl2hYlxa3LqgI6vfWquK0wMSSq-oHXMsBiX6Pf1X7t',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ---------- Roblox OAuth2 ----------
passport.use(
  'roblox',
  new OAuth2Strategy(
    {
      authorizationURL: 'https://apis.roblox.com/oauth/v1/authorize',
      tokenURL: 'https://apis.roblox.com/oauth/v1/token',
      clientID: process.env.ROBLOX_CLIENT_ID,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET,
      callbackURL: 'https://hire-a-dev-on-roblox-hire.onrender.com/api/oauth/callback',
      scope: ['openid', 'profile'],
    },
    async (accessToken, refreshToken, params, done) => {
      try {
        const ui = await axios.get(
          'https://apis.roblox.com/oauth/v1/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const data = ui.data;
        const user = {
          id: data.sub,
          username: data.name,
          displayName: data.display_name || data.name,
          avatar:
            data.avatar_thumbnail ||
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${data.sub}&size=150x150&format=Png`,
          accessToken,
          refreshToken: refreshToken || null,
        };
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ---------- Auth routes ----------
app.get('/api/oauth/roblox', passport.authenticate('roblox'));

app.get(
  '/api/oauth/callback',
  passport.authenticate('roblox', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// ---------- Session helpers ----------
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  const { id, username, displayName, avatar } = req.user;
  res.json({ id, username, displayName, avatar });
});

app.get('/api/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/'));
  });
});

// ---------- Proxy routes ----------
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const r = await axios.get(
      `https://friends.roblox.com/v1/users/${req.user.id}/friends`
    );
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

app.get('/api/badges', requireAuth, async (req, res) => {
  try {
    const r = await axios.get(
      `https://badges.roblox.com/v1/users/${req.user.id}/badges?limit=6`
    );
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// ---------- Clean routes (no .html) ----------
app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.get('/terms', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'terms.html'))
);
app.get('/privacy', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'))
);

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on https://hire-a-dev-on-roblox-hire.onrender.com`);
});
