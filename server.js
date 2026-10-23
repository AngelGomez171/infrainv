'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
let config;
try {
  config = require('./src/config');
} catch (err) {
  console.error(`❌ Configuración inválida: ${err.message}`);
  console.error('   Revisa las variables de entorno (ver .env.example).');
  process.exit(1);
}
const db = require('./src/db');
const { initDatabase } = require('./src/bootstrap');
const { authRequired } = require('./src/middleware/auth');
const { HttpError } = require('./src/utils');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render está detrás de un proxy: necesario para IP real y rate-limit

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      'script-src-attr': ["'unsafe-inline'"], // el HTML usa onclick="..."
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'upgrade-insecure-requests': null,
    },
  },
}));
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

// Health check para Render (también verifica la BD)
app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// ---------- API ----------
const api = express.Router();
api.use('/auth', require('./src/routes/auth'));
api.use(authRequired); // todo lo que sigue exige sesión
api.use('/usuarios', require('./src/routes/usuarios'));
api.use('/alimentos', require('./src/routes/inventario'));
const { utensilios, prestamos } = require('./src/routes/utensilios');
api.use('/utensilios', utensilios);
api.use('/prestamos', prestamos);
api.use('/pedidos', require('./src/routes/pedidos'));
const sistema = require('./src/routes/sistema');
api.use('/alertas', sistema.alertas);
api.use('/config', sistema.config);
api.use('/reportes', sistema.reportes);
api.use('/admin', sistema.admin);
api.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
app.use('/api', api);

// ---------- Frontend estático ----------
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '1h' : 0 }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- Manejo de errores ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ mensaje: 'Solicitud demasiado grande' });
  if (err instanceof HttpError) return res.status(err.status).json({ mensaje: err.message });
  const pgMap = {
    '23505': [409, 'Ya existe un registro con esos datos (valor duplicado)'],
    '23503': [409, 'Operación no permitida: hay registros relacionados'],
    '23514': [400, 'Los datos no cumplen las reglas de validación'],
    '22P02': [400, 'Formato de dato inválido'],
    '22007': [400, 'Fecha inválida'],
    '22008': [400, 'Fecha inválida'],
    '22003': [400, 'Número fuera de rango'],
  };
  if (db.isTransient(err)) return res.status(503).json({ mensaje: 'Base de datos no disponible. Inténtalo de nuevo en unos segundos.' });
  if (pgMap[err.code]) return res.status(pgMap[err.code][0]).json({ mensaje: pgMap[err.code][1] });
  console.error(`❌ ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ mensaje: 'Error interno del servidor' });
});

// ---------- Arranque ----------
// Se abre el puerto primero (Render exige detectar el puerto rápido) y luego se prepara la BD.
const server = app.listen(config.port, '0.0.0.0', () => console.log(`🚀 Servidor escuchando en el puerto ${config.port}`));
server.keepAliveTimeout = 65000; // mayor que el del balanceador de Render (evita 502 intermitentes)
server.headersTimeout = 66000;

(async () => {
  try {
    await db.waitForDb();
    await initDatabase();
    console.log('✅ Sistema listo');
  } catch (err) {
    console.error('❌ No se pudo inicializar la base de datos:', err.message);
    process.exit(1); // Render reinicia el servicio
  }
})();

const shutdown = (signal) => {
  console.log(`\n${signal} recibido: cerrando…`);
  server.close(async () => { await db.close().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r));
