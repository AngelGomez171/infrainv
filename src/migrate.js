'use strict';
// Uso: npm run migrate   (aplica db/schema.sql sin arrancar el servidor)
const { waitForDb, runSqlFile, close } = require('./db');
(async () => {
  try {
    await waitForDb();
    await runSqlFile('schema.sql');
    console.log('✅ Migración aplicada');
  } catch (err) {
    console.error('❌ Migración fallida:', err.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
