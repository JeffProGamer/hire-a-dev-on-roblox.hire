require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const axios = require('axios');
const axiosRetry = require('axios-retry');

const app = express();

// ---------- Axios retry ----------
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

// ---------- Middleware ----------
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
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
      callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/api/oauth/callback',
      scope: ['openid', 'profile'],
    },
    async (accessToken, refreshToken, params, done) => {
      try {
        const ui = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

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
    res.redirect('/'); // redirect to main page
  }
);

// ---------- Logout ----------
app.get('/api/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/'));
  });
});

// ---------- Auth middleware ----------
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/');
  next();
}

// ---------- Friends & badges ----------
app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const r = await axios.get(`https://friends.roblox.com/v1/users/${req.user.id}/friends`);
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

app.get('/api/badges', requireAuth, async (req, res) => {
  try {
    const r = await axios.get(`https://badges.roblox.com/v1/users/${req.user.id}/badges?limit=6`);
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// ---------- Set game pass ----------
app.post('/api/set-gamepass', requireAuth, (req, res) => {
  const { gamePassId } = req.body;
  if (!gamePassId) return res.status(400).json({ error: 'No game pass ID provided' });
  req.session.gamePass = gamePassId;
  res.json({ success: true });
});

// ---------- Dynamic main page ----------
app.get('/', (req, res) => {
  const user = req.user;
  const gamePassId = req.session?.gamePass || ''; // dynamic user-set game pass

  if (!user) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Hire Devs on Roblox</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-900 text-white flex items-center justify-center min-h-screen">
        <div class="text-center p-8 bg-gray-800 rounded-xl shadow-xl">
          <h1 class="text-3xl font-bold mb-4">Hire Devs on Roblox</h1>
          <p class="mb-6">Connect your Roblox account to continue.</p>
          <a href="/api/oauth/roblox" class="bg-red-500 px-6 py-3 rounded-full hover:bg-red-600 transition">Connect with Roblox</a>
        </div>
      </body>
      </html>
    `);
  }

  // dashboard page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Dashboard - Hire Devs on Roblox</title>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      <script src="https://cdn.jsdelivr.net/npm/axios@1.6.7/dist/axios.min.js"></script>
    </head>
    <body class="bg-gray-900 text-white min-h-screen p-6">
      <header class="flex justify-between items-center p-4 bg-gray-800 rounded-xl mb-6">
        <h1 class="text-2xl font-bold">Hire Devs on Roblox</h1>
        <div class="flex items-center space-x-4">
          <img src="${user.avatar}" alt="avatar" class="w-10 h-10 rounded-full border-2 border-red-500">
          <span>${user.displayName}</span>
          <a href="/api/logout" class="bg-red-500 px-3 py-1 rounded hover:bg-red-600 transition">Logout</a>
        </div>
      </header>

      <section class="mb-6">
        <h2 class="text-xl font-semibold mb-2">Set Your Game Pass</h2>
        <form id="gamepass-form" class="flex space-x-2">
          <input type="text" name="gamePassId" placeholder="Enter Game Pass ID" value="${gamePassId}" class="p-2 rounded bg-gray-700 flex-1">
          <button type="submit" class="bg-green-600 px-4 py-2 rounded hover:bg-green-500 transition">Save</button>
        </form>
        <p class="mt-2 text-gray-400">Current Game Pass: ${gamePassId || 'None'}</p>
      </section>

      <section>
        <a href="https://www.roblox.com/game-pass/${gamePassId}" target="_blank" class="block bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 transition mb-4 ${gamePassId ? '' : 'opacity-50 pointer-events-none'}">Hire Player</a>
        <a href="https://www.roblox.com/users/${user.id}/profile" target="_blank" class="block bg-purple-600 px-4 py-2 rounded hover:bg-purple-500 transition">View Profile</a>
      </section>

      <script>
        const form = document.getElementById('gamepass-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const gamePassId = form.gamePassId.value.trim();
          if (!gamePassId) return alert('Enter a Game Pass ID');
          await axios.post('/api/set-gamepass', { gamePassId });
          window.location.reload();
        });
      </script>
    </body>
    </html>
  `);
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
