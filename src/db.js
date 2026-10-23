'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('./config');

// Tipos: DATE como 'YYYY-MM-DD' (sin desfase de zona horaria), BIGINT y NUMERIC como número JS
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));

const pool = new Pool({
  ...config.db,
  ...(config.dbSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  ...config.pool,
  keepAlive: true,
  // Zona horaria de la sesión como parámetro de arranque: CURRENT_DATE = día local del negocio.
  // (Si tu proveedor usa PgBouncer y lo rechaza, define DB_SESSION_TZ=false)
  ...(process.env.DB_SESSION_TZ === 'false' ? {} : { options: `-c TimeZone=${config.timezone}` }),
});

// Un error en un cliente inactivo NO debe tumbar el proceso (p.ej. reinicio de la BD)
pool.on('error', (err) => console.error('⚠️  Error en cliente inactivo del pool:', err.message));

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006']);
const isTransient = (err) =>
  TRANSIENT_CODES.has(err.code) || /Connection terminated|timeout expired|server closed the connection/i.test(err.message || '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Consulta con 1 reintento automático ante cortes de conexión transitorios. */
async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isTransient(err)) throw err;
    console.warn('↻ Reintentando consulta tras error de conexión:', err.message);
    await sleep(500);
    return pool.query(text, params);
  }
}

/** Transacción: BEGIN/COMMIT/ROLLBACK con liberación segura del cliente. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión ya perdida */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Espera a que la BD responda (útil en arranques en frío de Render). */
async function waitForDb(retries = 8, baseDelay = 1000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Conectado a PostgreSQL');
      return;
    } catch (err) {
      console.error(`❌ BD no disponible (intento ${i}/${retries}): ${err.message}`);
      if (i === retries) throw err;
      await sleep(Math.min(baseDelay * 2 ** (i - 1), 15000));
    }
  }
}

const readSql = (file) => fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');

/** Ejecuta un archivo SQL completo con un lock para evitar carreras entre instancias. */
async function runSqlFile(file) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727272)');
    await client.query(readSql(file));
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(727272)'); } catch (_) {}
    client.release();
  }
}

module.exports = { pool, isTransient, query, tx, waitForDb, runSqlFile, readSql, close: () => pool.end() };
