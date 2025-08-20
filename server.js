// server.js  (Render-ready, real Roblox OAuth2 + session + /api/me)
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

// ----- Config (Render) -----
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET || ""; // optional for public clients (PKCE)
const BASE_URL = process.env.BASE_URL; // e.g. https://your-service.onrender.com
const REDIRECT_URI = `${BASE_URL}/api/oauth/roblox/callback`;

// Trust Render proxy for secure cookies
app.set("trust proxy", 1);

// Sessions
app.use(
  session({
    name: "__roblox.sid",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Static (serves site.html)
app.use(express.static(__dirname));

// ---------- Helpers ----------
const b64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sha256 = (str) => crypto.createHash("sha256").update(str).digest();

function makePKCE(sessionObj) {
  const codeVerifier = b64url(crypto.randomBytes(64));
  const codeChallenge = b64url(sha256(codeVerifier));
  const state = b64url(crypto.randomBytes(16));
  sessionObj.oauth = sessionObj.oauth || {};
  sessionObj.oauth.codeVerifier = codeVerifier;
  sessionObj.oauth.state = state;
  return { codeVerifier, codeChallenge, state };
}

async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  if (CLIENT_SECRET) params.append("client_secret", CLIENT_SECRET);

  const resp = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`token error ${resp.status}: ${JSON.stringify(json)}`);
  return json; // {access_token, refresh_token, expires_in, token_type, scope, id_token}
}

async function refreshTokens(refreshToken) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  if (CLIENT_SECRET) params.append("client_secret", CLIENT_SECRET);

  const resp = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`refresh error ${resp.status}: ${JSON.stringify(json)}`);
  return json;
}

async function getUserInfo(accessToken) {
  const resp = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`userinfo error ${resp.status}: ${JSON.stringify(json)}`);
  return json; // OpenID userinfo (sub, name, preferred_username, picture?, etc.)
}

async function getRobloxProfile(userId) {
  const resp = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  const json = await resp.json();
  if (!resp.ok) throw new Error(`users API error ${resp.status}: ${JSON.stringify(json)}`);
  return json; // {id, name, displayName, ...}
}

async function getAvatarUrl(userId) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok) throw new Error(`thumb error ${resp.status}: ${JSON.stringify(json)}`);
  return json?.data?.[0]?.imageUrl || null;
}

async function ensureAccessToken(req) {
  const now = Date.now();
  const oauth = req.session.oauth || {};
  if (!oauth.accessToken || !oauth.expiresAt) return null;

  if (now < oauth.expiresAt - 30000) return oauth.accessToken; // still valid

  if (!oauth.refreshToken) return null;

  const refreshed = await refreshTokens(oauth.refreshToken);
  req.session.oauth.accessToken = refreshed.access_token;
  req.session.oauth.refreshToken = refreshed.refresh_token || oauth.refreshToken;
  req.session.oauth.expiresAt = Date.now() + (refreshed.expires_in || 900) * 1000;
  return req.session.oauth.accessToken;
}

// ---------- Routes ----------

// Kick off Roblox OAuth (redirect to Roblox)
app.get("/api/oauth/roblox", (req, res) => {
  if (!CLIENT_ID || !BASE_URL) return res.status(500).send("Server not configured");
  const { codeChallenge, state } = makePKCE(req.session);

  const authURL = new URL("https://apis.roblox.com/oauth/v1/authorize");
  authURL.searchParams.set("client_id", CLIENT_ID);
  authURL.searchParams.set("response_type", "code");
  authURL.searchParams.set("redirect_uri", REDIRECT_URI);
  authURL.searchParams.set("scope", "openid profile");
  authURL.searchParams.set("code_challenge", codeChallenge);
  authURL.searchParams.set("code_challenge_method", "S256");
  authURL.searchParams.set("state", state);

  res.redirect(authURL.toString());
});

// OAuth callback from Roblox
app.get("/api/oauth/roblox/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code/state");

    if (!req.session.oauth || state !== req.session.oauth.state) {
      return res.status(400).send("Invalid state");
    }

    const { codeVerifier } = req.session.oauth;

    const tokenData = await exchangeCodeForTokens(code, codeVerifier);

    // Save tokens to session
    req.session.oauth.accessToken = tokenData.access_token;
    req.session.oauth.refreshToken = tokenData.refresh_token;
    req.session.oauth.expiresAt = Date.now() + (tokenData.expires_in || 900) * 1000;

    // Fetch user identity
    const info = await getUserInfo(req.session.oauth.accessToken);

    // Parse userId from sub (supports "users/123" or just "123")
    let userId = `${info.sub || ""}`.split("/").pop();

    // Fallback check
    if (!/^\d+$/.test(userId || "")) throw new Error("Could not parse Roblox userId from sub");

    // Extra profile + avatar
    const profile = await getRobloxProfile(userId);
    const avatarUrl = await getAvatarUrl(userId);

    // Save to session
    req.session.user = {
      id: userId,
      username: profile.name || info.preferred_username || "",
      displayName: profile.displayName || info.name || "",
      avatar: avatarUrl,
    };

    // Done → back to app
    return res.redirect("/site.html#connected=1");
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.redirect("/site.html#connected=0");
  }
});

// Current user
app.get("/api/me", async (req, res) => {
  try {
    // Refresh token if needed
    if (req.session.oauth?.accessToken) {
      await ensureAccessToken(req);
    }
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
    return res.json(req.session.user);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Logout
app.get("/api/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/site.html#logout=1"));
});

// Root → site.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "site.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Running on ${BASE_URL || "http://localhost:" + PORT}`);
});
