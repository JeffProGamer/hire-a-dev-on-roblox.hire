// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const axiosRetry = require('axios-retry');
const path = require('path');

const app = express();

// ---------- Robust axios retry ----------
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// ---------- Middleware ----------
app.use(express.json());
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'RBX-NYXHBUe2_UqBzSXR5zd8JwGl2hYlxa3LqgI6vfWquK0wMSSq-oHXMsBiX6Pf1X7t',
    resave: false,
    saveUninitialized: false,
    cookie: {
      // secure only in prod behind HTTPS
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ---------- Roblox OAuth2 (Open Cloud) ----------
// Docs: apis.roblox.com/oauth/v1/{authorize,token}, userinfo endpoint.
// Use scopes 'openid' and 'profile' for identity. PKCE is supported by Roblox;
// with server-side apps, standard authorization_code is fine. :contentReference[oaicite:1]{index=1}
passport.use(
  'roblox',
  new OAuth2Strategy(
    {
      authorizationURL: 'https://apis.roblox.com/oauth/v1/authorize',
      tokenURL: 'https://apis.roblox.com/oauth/v1/token',
      clientID: process.env.ROBLOX_CLIENT_ID,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET,
      callbackURL:
        process.env.CALLBACK_URL || 'http://localhost:3000/api/oauth/callback',
      scope: ['openid', 'profile'],
    },
    async (accessToken, refreshToken, params, done) => {
      try {
        // Standard OpenID Connect userinfo
        // Returns sub (user id), name, display_name, and avatar fields.
        const ui = await axios.get(
          'https://apis.roblox.com/oauth/v1/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const data = ui.data;
        const user = {
          id: data.sub, // Roblox user id (string)
          username: data.name,
          displayName: data.display_name || data.name,
          // If userinfo doesn't include avatar URL, fallback to thumbnails API:
          avatar:
            data.avatar_thumbnail ||
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${data.sub}&size=150x150&format=Png`,
          accessToken, // keep for server-side calls
          refreshToken: refreshToken || null,
        };
        return done(null, user);
      } catch (err) {
        console.error('Error fetching Roblox userinfo:', err.response?.data || err.message);
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
    res.redirect('/');
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

// ---------- Proxy routes (avoid CORS in browser) ----------
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// Friends API (public, but CORS blocks from browser). We proxy it.
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

// Badges API (public, but CORS blocks from browser). We proxy it.
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

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
