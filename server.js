// server.js
// Run with: node server.js  (Node 18+ recommended)

const express = require("express");
const session = require("express-session");
const path = require("path");
const { Issuer, generators } = require("openid-client");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Required ENV on Render:
// -----------------------------
// SESSION_SECRET=some-long-random-string
// ROBLOX_CLIENT_ID=your-client-id
// ROBLOX_CLIENT_SECRET=your-client-secret
// ROBLOX_CALLBACK_URL=https://hire-a-dev-on-roblox-hire.onrender.com/api/oauth/callback
//
// Roblox uses standard OIDC/OAuth2.0. Docs + discovery:
// https://apis.roblox.com/oauth/.well-known/openid-configuration
// -----------------------------

// Trust Render's proxy so secure cookies work
app.set("trust proxy", 1);

// Sessions
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Simple auth guard
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/index.html");
}

// -----------------------------
// OIDC (Roblox) setup
// -----------------------------
let oidcClient; // will be initialised before app starts

async function setupOIDC() {
  // Discover Roblox issuer & endpoints via OIDC discovery
  const robloxIssuer = await Issuer.discover("https://apis.roblox.com/oauth/");
  // Make the confidential client
  oidcClient = new robloxIssuer.Client({
    client_id: process.env.ROBLOX_CLIENT_ID,
    client_secret: process.env.ROBLOX_CLIENT_SECRET,
    redirect_uris: [process.env.ROBLOX_CALLBACK_URL],
    response_types: ["code"],
  });
}

// -----------------------------
// Routes (place BEFORE static to protect dashboard.html)
// -----------------------------

// Home -> if logged in, go to dashboard
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard.html");
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Protect the dashboard file by routing it explicitly
app.get("/dashboard.html", requireAuth, (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Public legal pages
app.get("/terms.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "terms.html"))
);
app.get("/privacy.html", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "privacy.html"))
);

// -----------------------------
// OAuth flows
// -----------------------------

// Kick off Roblox login
app.get("/api/oauth/roblox", (req, res) => {
  // Protect against CSRF & replay
  const state = generators.state();
  const nonce = generators.nonce();
  req.session.oauthState = state;
  req.session.oauthNonce = nonce;

  // Request standard scopes: openid + profile (username, display name, etc.)
  // (Roblox OAuth scopes are documented by Roblox; `profile` returns names.)
  const authorizationUrl = oidcClient.authorizationUrl({
    scope: "openid profile",
    state,
    nonce,
  });
  return res.redirect(authorizationUrl);
});

// Callback from Roblox
app.get("/api/oauth/callback", async (req, res) => {
  try {
    const params = oidcClient.callbackParams(req);
    const expectedState = req.session.oauthState;
    const expectedNonce = req.session.oauthNonce;

    // Finish the code flow (+ state/nonce checks internally)
    const tokenSet = await oidcClient.callback(
      process.env.ROBLOX_CALLBACK_URL,
      params,
      { state: expectedState, nonce: expectedNonce }
    );

    // Grab user info (standard OIDC userinfo)
    // With 'profile' scope, Roblox returns username/display name here.
    const userinfo = await oidcClient.userinfo(tokenSet);

    // Build the user object for the session
    const userId = String(userinfo.sub); // numeric Roblox userId as string
    const username =
      userinfo.preferred_username || userinfo.nickname || userinfo.name || "";
    const displayName = userinfo.name || username || "";
    const avatar = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;

    req.session.user = {
      id: userId,
      username,
      displayName,
      avatar,
      // Optional: store tokens if you later call OAuth-protected APIs
      tokens: {
        access_token: tokenSet.access_token,
        id_token: tokenSet.id_token,
        expires_at: tokenSet.expires_at,
        scope: tokenSet.scope,
        token_type: tokenSet.token_type,
        refresh_token: tokenSet.refresh_token || null,
      },
    };

    // Cleanup one-time values
    delete req.session.oauthState;
    delete req.session.oauthNonce;

    return res.redirect("/dashboard.html");
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.redirect("/index.html?error=oauth_failed");
  }
});

// Logout (destroy session)
app.get("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    return res.redirect("/index.html");
  });
});

// -----------------------------
// API (same origin)
// -----------------------------

// Current user
app.get("/api/me", requireAuth, (req, res) => {
  const { user } = req.session;
  // Never leak tokens to the frontend
  const { tokens, ...safeUser } = user || {};
  res.json(safeUser || null);
});

// Friends – public Roblox endpoint (no OAuth needed)
app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const r = await fetch(`https://friends.roblox.com/v1/users/${uid}/friends`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Badges – public Roblox endpoint (no OAuth needed)
app.get("/api/badges", requireAuth, async (req, res) => {
  try {
    const uid = req.session.user.id;
    const r = await fetch(
      `https://badges.roblox.com/v1/users/${uid}/badges?limit=10&sortOrder=Desc`
    );
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// -----------------------------
// Static files (after routes so /dashboard.html stays protected)
// -----------------------------
app.use(express.static(path.join(__dirname, "public")));

// Health check (optional for Render)
app.get("/healthz", (_req, res) => res.send("ok"));

// -----------------------------
// Boot
// -----------------------------
(async () => {
  try {
    await setupOIDC();
    app.listen(PORT, () =>
      console.log(`✅ Server running on http://localhost:${PORT}`)
    );
  } catch (e) {
    console.error("Failed to init OIDC:", e);
    process.exit(1);
  }
})();
