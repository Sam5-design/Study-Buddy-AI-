require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const connectDB = require('./config/db');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const app = express();

connectDB();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

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

// 404 handler for routes that don't exist
app.use((req, res) => {
  res.status(404).send("Sorry, that page doesn't exist.");
});

// General error-handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong on our end. Please try again.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});