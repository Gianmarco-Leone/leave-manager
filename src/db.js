const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'leave.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accrual_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      leave_days_per_month REAL NOT NULL DEFAULT 2.0,
      permission_hours_per_month REAL NOT NULL DEFAULT 0.0,
      accrual_start_date TEXT NOT NULL DEFAULT (date('now', 'start of month')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leave_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      days REAL NOT NULL,
      note TEXT,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS permission_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hours REAL NOT NULL,
      note TEXT,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_accrual_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      leave_days_added REAL NOT NULL DEFAULT 0,
      permission_hours_added REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, year, month),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Seed admin user se non esiste
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('admin', 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)'
    ).run('admin', hash, 'Admin');

    // Valori di default — personalizzabili da Impostazioni dopo il primo accesso.
    // Esempio contratto tipico italiano: 26 gg/anno = ~2.17/mese, ROL ~32-88 ore/anno.
    db.prepare(
      'INSERT INTO accrual_config (user_id, leave_days_per_month, permission_hours_per_month) VALUES (?, 2.17, 5.0)'
    ).run(result.lastInsertRowid);

    // Nessun saldo iniziale: il primo mese va aggiunto manualmente tramite
    // la funzione "Maturazione manuale (backfill)" in Impostazioni.
    console.log('[DB] Utente admin creato — password: admin. Cambiarla subito dal pannello Impostazioni!');
  }
}

module.exports = { getDb };
