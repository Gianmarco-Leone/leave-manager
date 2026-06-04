const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const router = express.Router();

// Middleware autenticazione
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non autenticato' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ error: 'Accesso negato' });
  next();
}

// ─── SALDO ────────────────────────────────────────────────────────────────────

router.get('/balance', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  // Totale maturato per anno corrente
  const accrualCurrent = db.prepare(`
    SELECT COALESCE(SUM(leave_days_added), 0) as leave_days,
           COALESCE(SUM(permission_hours_added), 0) as permission_hours
    FROM monthly_accrual_log
    WHERE user_id = ? AND year = ?
  `).get(userId, currentYear);

  const accrualPrev = db.prepare(`
    SELECT COALESCE(SUM(leave_days_added), 0) as leave_days,
           COALESCE(SUM(permission_hours_added), 0) as permission_hours
    FROM monthly_accrual_log
    WHERE user_id = ? AND year = ?
  `).get(userId, previousYear);

  // Totale usato per anno
  const usedLeaveCurrent = db.prepare(`
    SELECT COALESCE(SUM(days), 0) as total FROM leave_entries WHERE user_id = ? AND year = ?
  `).get(userId, currentYear);

  const usedLeavePrev = db.prepare(`
    SELECT COALESCE(SUM(days), 0) as total FROM leave_entries WHERE user_id = ? AND year = ?
  `).get(userId, previousYear);

  const usedPermCurrent = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as total FROM permission_entries WHERE user_id = ? AND year = ?
  `).get(userId, currentYear);

  const usedPermPrev = db.prepare(`
    SELECT COALESCE(SUM(hours), 0) as total FROM permission_entries WHERE user_id = ? AND year = ?
  `).get(userId, previousYear);

  const remainingLeavePrev = accrualPrev.leave_days - usedLeavePrev.total;
  const remainingLeaveCurrentOnly = accrualCurrent.leave_days - usedLeaveCurrent.total;
  const remainingLeaveTotal = remainingLeavePrev + remainingLeaveCurrentOnly;

  const remainingPermPrev = accrualPrev.permission_hours - usedPermPrev.total;
  const remainingPermCurrentOnly = accrualCurrent.permission_hours - usedPermCurrent.total;
  const remainingPermTotal = remainingPermPrev + remainingPermCurrentOnly;

  res.json({
    currentYear,
    previousYear,
    leave: {
      accrued: accrualCurrent.leave_days,
      used: usedLeaveCurrent.total,
      remainingCurrentYear: parseFloat(remainingLeaveCurrentOnly.toFixed(2)),
      remainingFromPreviousYear: parseFloat(Math.max(0, remainingLeavePrev).toFixed(2)),
      remainingTotal: parseFloat(remainingLeaveTotal.toFixed(2)),
      hasPreviousYearRemainder: remainingLeavePrev > 0
    },
    permission: {
      accrued: accrualCurrent.permission_hours,
      used: usedPermCurrent.total,
      remainingCurrentYear: parseFloat(remainingPermCurrentOnly.toFixed(2)),
      remainingFromPreviousYear: parseFloat(Math.max(0, remainingPermPrev).toFixed(2)),
      remainingTotal: parseFloat(remainingPermTotal.toFixed(2)),
      hasPreviousYearRemainder: remainingPermPrev > 0
    }
  });
});

// ─── FERIE ENTRIES ────────────────────────────────────────────────────────────

router.get('/leave', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM leave_entries WHERE user_id = ?
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 100
  `).all(req.session.userId);
  res.json(rows);
});

router.post('/leave', requireAuth, (req, res) => {
  const { days, note, entry_date } = req.body;
  if (!days || isNaN(days) || days <= 0) {
    return res.status(400).json({ error: 'Numero di giorni non valido' });
  }
  const db = getDb();
  const date = entry_date || new Date().toISOString().split('T')[0];
  const year = parseInt(date.split('-')[0]);

  db.prepare(`
    INSERT INTO leave_entries (user_id, days, note, entry_date, year)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.session.userId, parseFloat(days), note || null, date, year);

  res.json({ ok: true });
});

router.delete('/leave/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM leave_entries WHERE id = ?').get(req.params.id);
  if (!entry || entry.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Voce non trovata' });
  }
  db.prepare('DELETE FROM leave_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── PERMESSO ENTRIES ─────────────────────────────────────────────────────────

router.get('/permission', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM permission_entries WHERE user_id = ?
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 100
  `).all(req.session.userId);
  res.json(rows);
});

router.post('/permission', requireAuth, (req, res) => {
  const { hours, note, entry_date } = req.body;
  if (!hours || isNaN(hours) || hours <= 0) {
    return res.status(400).json({ error: 'Numero di ore non valido' });
  }
  const db = getDb();
  const date = entry_date || new Date().toISOString().split('T')[0];
  const year = parseInt(date.split('-')[0]);

  db.prepare(`
    INSERT INTO permission_entries (user_id, hours, note, entry_date, year)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.session.userId, parseFloat(hours), note || null, date, year);

  res.json({ ok: true });
});

router.delete('/permission/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM permission_entries WHERE id = ?').get(req.params.id);
  if (!entry || entry.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'Voce non trovata' });
  }
  db.prepare('DELETE FROM permission_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CONFIGURAZIONE (solo admin) ──────────────────────────────────────────────

router.get('/config', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_admin,
           c.leave_days_per_month, c.permission_hours_per_month, c.accrual_start_date
    FROM users u
    LEFT JOIN accrual_config c ON c.user_id = u.id
    ORDER BY u.id
  `).all();
  res.json(rows);
});

router.put('/config/:userId', requireAuth, requireAdmin, (req, res) => {
  const { leave_days_per_month, permission_hours_per_month } = req.body;
  if (leave_days_per_month === undefined || permission_hours_per_month === undefined) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO accrual_config (user_id, leave_days_per_month, permission_hours_per_month)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      leave_days_per_month = excluded.leave_days_per_month,
      permission_hours_per_month = excluded.permission_hours_per_month
  `).run(parseInt(req.params.userId), parseFloat(leave_days_per_month), parseFloat(permission_hours_per_month));
  res.json({ ok: true });
});

// ─── UTENTI (solo admin) ──────────────────────────────────────────────────────

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY id').all();
  res.json(users);
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username già esistente' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run(username, hash, display_name);

  db.prepare(
    'INSERT INTO accrual_config (user_id, leave_days_per_month, permission_hours_per_month) VALUES (?, 2.0, 8.0)'
  ).run(result.lastInsertRowid);

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/users/:id/password', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.session.userId !== targetId && !req.session.isAdmin) {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password troppo corta (min 4 caratteri)' });
  }
  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId);
  res.json({ ok: true });
});

router.put('/users/:id/display-name', requireAuth, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.session.userId !== targetId && !req.session.isAdmin) {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  const { display_name } = req.body;
  if (!display_name || display_name.trim().length < 1) {
    return res.status(400).json({ error: 'Nome non valido' });
  }
  const db = getDb();
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name.trim(), targetId);
  // Aggiorna la sessione se è l'utente corrente
  if (req.session.userId === targetId) {
    req.session.displayName = display_name.trim();
  }
  res.json({ ok: true });
});

// ─── SALDO DI APERTURA (solo admin) ──────────────────────────────────────────

router.post('/accrual/opening', requireAuth, requireAdmin, (req, res) => {
  const { user_id, year, month, leave_days, permission_hours } = req.body;
  if (!user_id || !year || !month || leave_days === undefined || permission_hours === undefined) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO monthly_accrual_log (user_id, year, month, leave_days_added, permission_hours_added)
      VALUES (?, ?, ?, ?, ?)
    `).run(user_id, year, month, parseFloat(leave_days), parseFloat(permission_hours));
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Esiste già una voce per ${year}/${month}. Eliminala prima dal DB o scegli un altro mese.` });
    }
    throw e;
  }
});

// ─── MATURAZIONE MANUALE (solo admin, per backfill) ───────────────────────────

router.post('/accrual/manual', requireAuth, requireAdmin, (req, res) => {
  const { user_id, year, month } = req.body;
  if (!user_id || !year || !month) {
    return res.status(400).json({ error: 'Parametri mancanti (user_id, year, month)' });
  }
  const db = getDb();
  const config = db.prepare('SELECT * FROM accrual_config WHERE user_id = ?').get(user_id);
  if (!config) return res.status(404).json({ error: 'Configurazione utente non trovata' });

  try {
    db.prepare(`
      INSERT INTO monthly_accrual_log (user_id, year, month, leave_days_added, permission_hours_added)
      VALUES (?, ?, ?, ?, ?)
    `).run(user_id, year, month, config.leave_days_per_month, config.permission_hours_per_month);
    res.json({ ok: true, leave_days_added: config.leave_days_per_month, permission_hours_added: config.permission_hours_per_month });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Maturazione per ${year}/${month} già registrata` });
    }
    throw e;
  }
});

router.get('/accrual/log', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM monthly_accrual_log WHERE user_id = ?
    ORDER BY year DESC, month DESC
  `).all(req.session.userId);
  res.json(rows);
});

module.exports = router;
