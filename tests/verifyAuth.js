/**
 * Verification script for registration, login, logout, and the
 * protected-route middleware (authController + ensureAuth).
 * Run with: node tests/verifyAuth.js
 * Needs a real MongoDB connection — uses the same DB as .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { register, login, logout } = require('../controllers/authController');
const ensureAuth = require('../middleware/ensureAuth');

function fakeRes(label) {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; console.log(`[${label}] ${this.statusCode}`, payload); return this; },
    redirect(url) { console.log(`[${label}] redirect ->`, url); return this; },
  };
}

function fakeReq(body, opts = {}) {
  return {
    body,
    user: opts.user || null,
    isAuthenticated: () => !!opts.user,
    login(user, cb) { this.user = user; cb(null); },
    logout(cb) { this.user = null; cb(null); },
    session: { destroy(cb) { cb(); } },
  };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({ email: { $in: ['verify-test@test.com', 'verify-test2@test.com'] } }); // clean slate

  // --- REGISTER ---
  await register(fakeReq({ email: 'verify-test@test.com', password: 'password123', confirmPassword: 'password123' }), fakeRes('register-new'), console.error);
  await register(fakeReq({ email: 'verify-test@test.com', password: 'password123', confirmPassword: 'password123' }), fakeRes('register-duplicate'), console.error);
  await register(fakeReq({ email: 'verify-test2@test.com', password: 'password123', confirmPassword: 'wrong' }), fakeRes('register-mismatch'), console.error);

  const savedUser = await User.findOne({ email: 'verify-test@test.com' });
  const isHashed = savedUser.password !== 'password123' && await bcrypt.compare('password123', savedUser.password);
  console.log('[password-hashed-correctly]', isHashed);

  // --- LOGIN ---
  // Note: login() calls passport.authenticate, which needs the request to go through
  // Passport's actual middleware chain, so we call it via a minimal Express app
  // instead of a fully fake req/res — this keeps the test honest.
  const express = require('express');
  const session = require('express-session');
  const passport = require('../config/passport');
  const request = await getSupertestOrSkip();

  if (request) {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.post('/login', login);
    app.get('/protected', ensureAuth, (req, res) => res.status(200).json({ message: 'ok' }));

    const agent = request.agent(app);

    const validLogin = await agent.post('/login').send({ email: 'verify-test@test.com', password: 'password123' });
    console.log('[login-valid]', validLogin.status, validLogin.body);

    const protectedAfterLogin = await agent.get('/protected');
    console.log('[protected-after-login]', protectedAfterLogin.status, protectedAfterLogin.body);

    const freshAgent = request.agent(app);
    const invalidLogin = await freshAgent.post('/login').send({ email: 'verify-test@test.com', password: 'wrongpassword' });
    console.log('[login-invalid]', invalidLogin.status, invalidLogin.body);

    const protectedWithoutLogin = await freshAgent.get('/protected');
    console.log('[protected-without-login]', protectedWithoutLogin.status, protectedWithoutLogin.body);
  } else {
    console.log('[skipped] login/protected-route tests need "supertest" (npm install --save-dev supertest) — see note below.');
  }

  await User.deleteMany({ email: { $in: ['verify-test@test.com', 'verify-test2@test.com'] } }); // cleanup
  await mongoose.disconnect();
}

async function getSupertestOrSkip() {
  try { return require('supertest'); } catch { return null; }
}

run().catch((err) => { console.error(err); process.exit(1); });
