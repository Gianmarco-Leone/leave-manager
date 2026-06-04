const cron = require('node-cron');
const { getDb } = require('./db');

function runMonthlyAccrual(year, month) {
  const db = getDb();
  const users = db.prepare('SELECT u.id, c.leave_days_per_month, c.permission_hours_per_month FROM users u JOIN accrual_config c ON c.user_id = u.id').all();

  let processed = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      db.prepare(`
        INSERT INTO monthly_accrual_log (user_id, year, month, leave_days_added, permission_hours_added)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, year, month, user.leave_days_per_month, user.permission_hours_per_month);
      processed++;
      console.log(`[CRON] Maturazione ${year}/${month} → utente ${user.id}: +${user.leave_days_per_month}gg ferie, +${user.permission_hours_per_month}h permesso`);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        skipped++;
      } else {
        console.error(`[CRON] Errore utente ${user.id}:`, e.message);
      }
    }
  }

  console.log(`[CRON] Maturazione ${year}/${month} completata: ${processed} elaborati, ${skipped} già presenti`);
}

function scheduleCron() {
  // Ogni 1° del mese alle 00:05
  cron.schedule('5 0 1 * *', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    console.log(`[CRON] Avvio maturazione automatica per ${year}/${month}`);
    runMonthlyAccrual(year, month);
  }, {
    timezone: 'Europe/Rome'
  });

  console.log('[CRON] Job maturazione mensile schedulato (1° del mese alle 00:05)');
}

module.exports = { scheduleCron, runMonthlyAccrual };
