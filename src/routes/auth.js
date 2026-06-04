const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Credenziali mancanti' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username o password errati' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.display_name;
  req.session.isAdmin = user.is_admin === 1;

  res.json({ ok: true, displayName: user.display_name, isAdmin: user.is_admin === 1 });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  res.json({
    userId: req.session.userId,
    username: req.session.username,
    displayName: req.session.displayName,
    isAdmin: req.session.isAdmin
  });
});

module.exports = router;
