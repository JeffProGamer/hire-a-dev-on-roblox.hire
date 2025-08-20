const express = require("express");
const session = require("express-session");
const passport = require("passport");
const RobloxStrategy = require("passport-roblox").Strategy;
const path = require("path");

const app = express();

passport.use(new RobloxStrategy({
  clientID: process.env.ROBLOX_CLIENT_ID,
  clientSecret: process.env.ROBLOX_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/api/oauth/callback"
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(session({ secret: "keyboard cat", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.get("/api/oauth/roblox", passport.authenticate("roblox"));
app.get("/api/oauth/callback", passport.authenticate("roblox", {
  failureRedirect: "/"
}), (req, res) => {
  res.redirect("/");
});

app.get("/api/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in" });
  res.json({
    username: req.user.username,
    displayName: req.user.displayName,
    avatar: req.user.avatar
  });
});

app.get("/api/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
