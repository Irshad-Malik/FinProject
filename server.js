const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'homora-dev-jwt-secret-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'homora.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    });
  });
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function setAuthCookie(response, token) {
  response.cookie('homora_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(request, response, next) {
  const token = request.cookies?.homora_token;

  if (!token) {
    return response.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    db.get('SELECT id, email FROM users WHERE id = ?', [payload.sub], (error, user) => {
      if (error) {
        return response.status(500).json({ message: 'Database error while checking session.' });
      }

      if (!user) {
        return response.status(401).json({ message: 'Session expired or invalid.' });
      }

      request.user = user;
      next();
    });
  } catch (error) {
    return response.status(401).json({ message: 'Session expired or invalid.' });
  }
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(__dirname));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'Homora Finance API' });
});

app.post('/api/auth/signup', async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = String(request.body.password || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ message: 'A valid email is required.' });
  }

  if (password.length < 6) {
    return response.status(400).json({ message: 'Password must be at least 6 characters long.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    db.run(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash],
      function (error) {
        if (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return response.status(409).json({ message: 'An account with this email already exists.' });
          }

          return response.status(500).json({ message: 'Unable to create account.' });
        }

        const token = createToken({ id: this.lastID, email });
        setAuthCookie(response, token);

        return response.status(201).json({
          message: 'Account created successfully.',
          user: { email },
        });
      }
    );
  } catch (error) {
    return response.status(500).json({ message: 'Unable to create account.' });
  }
});

app.post('/api/auth/login', (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = String(request.body.password || '');

  if (!email || !password) {
    return response.status(400).json({ message: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (error, user) => {
    if (error) {
      return response.status(500).json({ message: 'Database error while signing in.' });
    }

    if (!user) {
      return response.status(401).json({ message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return response.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createToken({ id: user.id, email: user.email });
    setAuthCookie(response, token);

    return response.json({
      message: 'Login successful.',
      user: { email: user.email },
    });
  });
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({
    user: {
      email: request.user.email,
    },
  });
});

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie('homora_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  });

  response.json({ message: 'Logged out successfully.' });
});

app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api/')) {
    return next();
  }

  return response.sendFile(path.join(__dirname, 'index.html'));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Homora Finance API running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
