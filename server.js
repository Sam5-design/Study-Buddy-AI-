require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const passport = require('./config/passport');
const connectDB = require('./config/db');

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