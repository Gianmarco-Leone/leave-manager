const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Assicura che la cartella data esista
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const { getDb } = require('./src/db');
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');
const { scheduleCron } = require('./src/cron');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'leave-manager-secret-changeme';

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessioni persistenti su file SQLite
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 giorni
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ── ROUTES ────────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Redirect root → dashboard se loggato, altrimenti login
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard.html');
  } else {
    res.redirect('/index.html');
  }
});

// File statici
app.use(express.static(path.join(__dirname, 'public')));

// ── INIT ──────────────────────────────────────────────────────────────────────

getDb(); // Inizializza DB e schema
scheduleCron(); // Avvia cron maturazione mensile

app.listen(PORT, () => {
  console.log(`🏖️  Leave Manager avviato su http://localhost:${PORT}`);
  console.log(`   Credenziali iniziali: admin / admin`);
  console.log(`   ⚠️  Cambia la password al primo accesso!`);
});
