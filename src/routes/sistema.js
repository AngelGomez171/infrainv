'use strict';
// Alertas, configuración, reportes y mantenimiento
const alertas = require('express').Router();
const config = require('express').Router();
const reportes = require('express').Router();
const admin = require('express').Router();
const { query, tx, readSql } = require('../db');
const { requireRole } = require('../middleware/auth');
const { wrap, num } = require('../utils');

const getDias = async (client = { query }) => {
  const { rows } = await client.query("SELECT valor FROM configuracion WHERE clave = 'dias_caducidad'");
  const n = parseInt(rows[0]?.valor, 10);
  return Number.isFinite(n) ? n : 3;
};

// ---------- Alertas (calculadas en vivo; solo se persiste el estado "leída") ----------
async function calcularAlertas(userId) {
  const dias = await getDias();
  const { rows: items } = await query(
    `SELECT id, nombre, cantidad, unidad, stock_minimo, fecha_caducidad,
            (fecha_caducidad - CURRENT_DATE) AS dias
     FROM alimentos ORDER BY nombre`);
  const out = [];
  for (const a of items) {
    if (a.cantidad <= 0) {
      out.push({ clave: `agotado:${a.id}`, nivel: 'danger', icono: '🚫', mensaje: `${a.nombre} está agotado` });
    } else if (a.cantidad <= a.stock_minimo) {
      out.push({ clave: `stock:${a.id}`, nivel: 'warning', icono: '⚠️', mensaje: `Stock bajo: ${a.nombre} (${a.cantidad} ${a.unidad}, mínimo ${a.stock_minimo})` });
    }
    if (a.fecha_caducidad) {
      if (a.dias < 0) {
        out.push({ clave: `caducado:${a.id}:${a.fecha_caducidad}`, nivel: 'danger', icono: '⛔', mensaje: `${a.nombre} caducó el ${a.fecha_caducidad}` });
      } else if (a.dias <= dias) {
        const cuando = a.dias === 0 ? 'hoy' : a.dias === 1 ? 'mañana' : `en ${a.dias} días`;
        out.push({ clave: `caduca:${a.id}:${a.fecha_caducidad}`, nivel: 'warning', icono: '⏰', mensaje: `${a.nombre} caduca ${cuando} (${a.fecha_caducidad})` });
      }
    }
  }
  const { rows: leidas } = await query('SELECT clave FROM alertas_leidas WHERE usuario_id = $1', [userId]);
  const set = new Set(leidas.map((r) => r.clave));
  return out.map((a) => ({ ...a, leida: set.has(a.clave) }));
}

alertas.get('/', wrap(async (req, res) => res.json(await calcularAlertas(req.user.id))));

alertas.post('/leer', wrap(async (req, res) => {
  const claves = (await calcularAlertas(req.user.id)).filter((a) => !a.leida).map((a) => a.clave);
  if (claves.length) {
    await query(
      'INSERT INTO alertas_leidas (usuario_id, clave) SELECT $1, UNNEST($2::text[]) ON CONFLICT DO NOTHING',
      [req.user.id, claves]);
  }
  res.json({ mensaje: 'Alertas marcadas como leídas' });
}));

// ---------- Configuración ----------
config.get('/', wrap(async (_req, res) => res.json({ dias_caducidad: await getDias() })));

config.put('/', requireRole('Administrador'), wrap(async (req, res) => {
  const dias = num(req.body?.dias_caducidad, { field: 'Los días de anticipación', min: 1, max: 365, integer: true });
  await query(
    `INSERT INTO configuracion (clave, valor) VALUES ('dias_caducidad', $1)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`, [String(dias)]);
  res.json({ dias_caducidad: dias });
}));

// ---------- Reportes ----------
async function resumen() {
  const dias = await getDias();
  const [{ rows: [r] }, { rows: cats }, { rows: [u] }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_alimentos,
                  COUNT(*) FILTER (WHERE cantidad <= stock_minimo)::int AS stock_bajo,
                  COUNT(*) FILTER (WHERE fecha_caducidad IS NOT NULL AND fecha_caducidad <= CURRENT_DATE + $1::int)::int AS por_caducar
           FROM alimentos`, [dias]),
    query('SELECT categoria, COUNT(*)::int AS cantidad FROM alimentos GROUP BY categoria ORDER BY categoria'),
    query(`SELECT COUNT(*)::int AS total_utensilios,
                  COUNT(*) FILTER (WHERE estado = 'Disponible')::int AS utensilios_disponibles,
                  COUNT(*) FILTER (WHERE estado = 'Prestado')::int AS prestados
           FROM utensilios`),
  ]);
  return { ...r, ...u, categorias: cats };
}

reportes.get('/resumen', wrap(async (_req, res) => res.json(await resumen())));

reportes.get('/', wrap(async (_req, res) => {
  const { rows } = await query('SELECT id, tipo, contenido, creado_en FROM reportes ORDER BY creado_en DESC LIMIT 20');
  res.json(rows);
}));

reportes.post('/generar', wrap(async (req, res) => {
  const { rows } = await query(
    "INSERT INTO reportes (tipo, contenido, usuario_id) VALUES ('Inventario', $1, $2) RETURNING id, tipo, contenido, creado_en",
    [JSON.stringify(await resumen()), req.user.id]);
  res.status(201).json(rows[0]);
}));

// ---------- Mantenimiento ----------
admin.post('/reset', requireRole('Administrador'), wrap(async (_req, res) => {
  await tx(async (c) => {
    await c.query('TRUNCATE movimientos, pedidos, prestamos, alertas_leidas, reportes, utensilios, alimentos RESTART IDENTITY CASCADE');
    await c.query("UPDATE configuracion SET valor = '3' WHERE clave = 'dias_caducidad'");
    await c.query(readSql('seed_demo.sql'));
  });
  res.json({ mensaje: 'Sistema reiniciado con datos de ejemplo' });
}));

module.exports = { alertas, config, reportes, admin };
