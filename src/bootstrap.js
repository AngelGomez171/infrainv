'use strict';
const bcrypt = require('bcryptjs');
const config = require('./config');
const { query, runSqlFile } = require('./db');

async function ensureAdmin() {
  const { email, password, nombre } = config.admin;
  if (!email || !password) {
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'Administrador' AND activo");
    if (rows[0].n === 0) console.warn('⚠️  No hay administradores. Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primero.');
    return;
  }
  if (password.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');
  const { rows } = await query('SELECT 1 FROM usuarios WHERE LOWER(email) = $1', [email]);
  if (rows[0]) return; // ya existe: nunca se sobrescribe la contraseña
  const hash = await bcrypt.hash(password, 10);
  await query("INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, 'Administrador')", [nombre, email, hash]);
  console.log(`✅ Administrador inicial creado: ${email}`);
}

async function seedDemoIfEmpty() {
  const { rows } = await query('SELECT (SELECT COUNT(*) FROM alimentos) + (SELECT COUNT(*) FROM utensilios) AS n');
  if (Number(rows[0].n) === 0) {
    await runSqlFile('seed_demo.sql');
    console.log('✅ Datos de ejemplo cargados');
  }
}

async function initDatabase() {
  if (config.autoMigrate) {
    await runSqlFile('schema.sql');
    console.log('✅ Esquema de base de datos verificado');
  }
  await ensureAdmin();
  if (config.seedDemo) await seedDemoIfEmpty();
}

module.exports = { initDatabase };
