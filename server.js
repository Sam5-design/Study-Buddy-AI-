require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const passport = require('./config/passport');
const connectDB = require('./config/db');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const studyPlanRoutes = require('./routes/studyPlan');
const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');

const ensureAuth = require('./middleware/ensureAuth');

const app = express();


// ======================================================
// DATABASE
// ======================================================

connectDB();


// ======================================================
// VIEW ENGINE
// ======================================================

app.set('view engine', 'ejs');


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ======================================================
// SESSION
// ======================================================

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);


// ======================================================
// PASSPORT
// ======================================================

app.use(passport.initialize());
app.use(passport.session());


// Make logged-in user available in EJS
app.use((req, res, next) => {

  res.locals.currentUser =
    req.user || null;

  next();

});


// ======================================================
// PUBLIC PAGES
// ======================================================

app.get('/', (req, res) => {
  res.render('home');
});


app.get('/login', (req, res) => {
  res.render('auth/login');
});


app.get('/register', (req, res) => {
  res.render('auth/register');
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    req.login(newUser, (err) => {
      if (err) {
        console.error(err);
        return res.status(201).json({ message: 'Account created! Please log in.', redirect: '/login' });
      }
      return res.status(201).json({ message: 'Account created successfully!', redirect: '/' });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong on our end. Please try again.' });
  }
});

app.post('/api/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Something went wrong on our end. Please try again.' });
    }
    if (!user) {
      return res.status(401).json({ message: info && info.message ? info.message : 'Incorrect email or password.' });
    }
    req.login(user, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Login succeeded but session failed. Please try again.' });
      }
      return res.status(200).json({ message: 'Logged in successfully!', redirect: '/' });
    });
  })(req, res, next);
});


// ======================================================
// AUTH
// ======================================================

app.use('/', authRoutes);


// ======================================================
// DASHBOARD
// ======================================================

app.get(
  '/dashboard',
  ensureAuth,
  (req, res) => {

    res.render('dashboard');

  }
);


// ======================================================
// SUBJECT + TASK ROUTES
// ======================================================

// IMPORTANT:
//
// This handles BOTH:
//
// /subjects/new
//
// AND:
//
// /subjects/:subjectId/tasks/new
//
// So we do NOT need routes/tasks.js

app.use(
  '/subjects',
  subjectRoutes
);


// ======================================================
// STUDY PLAN
// ======================================================

app.use(
  '/study-plan',
  studyPlanRoutes
);


// ======================================================
// 404
// ======================================================

app.use((req, res) => {

  res.status(404).send(
    "Sorry, that page doesn't exist."
  );

});


// ======================================================
// ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {

  console.error(err.stack);

  res.status(500).send(
    'Something went wrong on our end. Please try again.'
  );

});


// ======================================================
// START SERVER
// ======================================================

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Server running on http://localhost:${PORT}`
  );

});