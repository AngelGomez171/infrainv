'use strict';
// Toda la configuración sale de variables de entorno. Sin valores secretos en el código.
require('dotenv').config({ quiet: true });

const required = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  return v.trim();
};
const int = (name, def) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : def;
};

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');

const timezone = process.env.APP_TIMEZONE || 'America/El_Salvador';
if (!/^[A-Za-z0-9_/+-]+$/.test(timezone)) throw new Error('APP_TIMEZONE no es válida');

const db = process.env.DATABASE_URL
  ? { connectionString: required('DATABASE_URL') }
  : {
      host: required('DB_HOST'),
      port: int('DB_PORT', 5432),
      user: required('DB_USER'),
      password: process.env.DB_PASSWORD || '',
      database: required('DB_NAME'),
    };

module.exports = {
  isProd: process.env.NODE_ENV === 'production',
  port: int('PORT', 3000), // Render inyecta PORT automáticamente
  jwt: { secret: jwtSecret, expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  db,
  dbSsl: process.env.DB_SSL === 'true', // true si usas la URL EXTERNA de Render o un proveedor externo
  pool: {
    max: int('DB_POOL_MAX', 10),
    idleTimeoutMillis: int('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: int('DB_CONNECT_TIMEOUT_MS', 10000),
  },
  timezone,
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  admin: {
    nombre: process.env.ADMIN_NAME || 'Administrador',
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
  },
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  seedDemo: process.env.SEED_DEMO === 'true',
};
