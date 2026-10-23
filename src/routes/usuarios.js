'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireRole } = require('../middleware/auth');
const { HttpError, bad, wrap, text, id } = require('../utils');

const ROLES = ['Administrador', 'Chef', 'Inventario'];

// Lista mínima para selects (préstamos): cualquier usuario autenticado
router.get('/basico', wrap(async (_req, res) => {
  const { rows } = await query('SELECT id, nombre FROM usuarios WHERE activo ORDER BY nombre');
  res.json(rows);
}));

router.get('/', requireRole('Administrador'), wrap(async (_req, res) => {
  const { rows } = await query('SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE activo ORDER BY id');
  res.json(rows);
}));

router.post('/', requireRole('Administrador'), wrap(async (req, res) => {
  const nombre = text(req.body.nombre, { field: 'El nombre', max: 100 });
  const email = text(req.body.email, { field: 'El correo', max: 150 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Correo electrónico inválido');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  if (password.length > 72) throw bad('La contraseña no puede superar 72 caracteres');
  const rol = req.body.rol;
  if (!ROLES.includes(rol)) throw bad('Rol inválido');

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
    [nombre, email, hash, rol]);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', requireRole('Administrador'), wrap(async (req, res) => {
  const uid = id(req.params.id);
  if (uid === req.user.id) throw new HttpError(409, 'No puedes eliminar tu propio usuario');
  const { rows: admins } = await query(
    "SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'Administrador' AND activo AND id <> $1", [uid]);
  const { rows: target } = await query('SELECT rol FROM usuarios WHERE id = $1 AND activo', [uid]);
  if (!target[0]) throw new HttpError(404, 'Usuario no encontrado');
  if (target[0].rol === 'Administrador' && admins[0].n === 0) throw new HttpError(409, 'Debe existir al menos un administrador');
  // Baja lógica: conserva el historial de préstamos/movimientos
  await query("UPDATE usuarios SET activo = FALSE, email = LEFT(email, 130) || '#baja' || id WHERE id = $1", [uid]);
  res.json({ mensaje: 'Usuario eliminado' });
}));

module.exports = router;
