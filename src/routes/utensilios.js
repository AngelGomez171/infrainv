'use strict';
const utensilios = require('express').Router();
const prestamos = require('express').Router();
const { query, tx } = require('../db');
const { HttpError, wrap, text, id } = require('../utils');

const ESTADOS = ['Disponible', 'Prestado', 'Extraviado'];

// ---------- Utensilios ----------
utensilios.get('/', wrap(async (_req, res) => {
  const { rows } = await query('SELECT * FROM utensilios ORDER BY nombre');
  res.json(rows);
}));

utensilios.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const nombre = text(b.nombre, { field: 'El nombre', max: 120 });
  const codigo = text(b.codigo, { field: 'El código', max: 40 }).toUpperCase();
  const ubicacion = text(b.ubicacion, { field: 'La ubicación', max: 120, required: false });
  const estado = ESTADOS.includes(b.estado) ? b.estado : 'Disponible';
  if (estado === 'Prestado') throw new HttpError(400, 'Usa el módulo de préstamos para prestar un utensilio');
  const { rows } = await query(
    'INSERT INTO utensilios (nombre, codigo, ubicacion, estado) VALUES ($1, $2, $3, $4) RETURNING *',
    [nombre, codigo, ubicacion, estado]);
  res.status(201).json(rows[0]);
}));

utensilios.delete('/:id', wrap(async (req, res) => {
  const uid = id(req.params.id);
  const { rows } = await query("SELECT 1 FROM prestamos WHERE utensilio_id = $1 AND estado = 'Activo'", [uid]);
  if (rows[0]) throw new HttpError(409, 'No se puede eliminar: el utensilio está prestado');
  const { rowCount } = await query('DELETE FROM utensilios WHERE id = $1', [uid]);
  if (!rowCount) throw new HttpError(404, 'Utensilio no encontrado');
  res.json({ mensaje: 'Utensilio eliminado' });
}));

// ---------- Préstamos ----------
prestamos.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT p.id, p.utensilio_id, u.nombre AS utensilio, us.nombre AS usuario,
           p.fecha_prestamo, p.fecha_devolucion, p.estado
    FROM prestamos p
    JOIN utensilios u  ON p.utensilio_id = u.id
    JOIN usuarios   us ON p.usuario_id  = us.id
    ORDER BY p.fecha_prestamo DESC
    LIMIT 500`);
  res.json(rows);
}));

prestamos.post('/', wrap(async (req, res) => {
  const utensilioId = id(req.body?.utensilio_id);
  const usuarioId = id(req.body?.usuario_id);
  const prestamo = await tx(async (c) => {
    const { rowCount } = await c.query(
      "UPDATE utensilios SET estado = 'Prestado' WHERE id = $1 AND estado = 'Disponible'", [utensilioId]);
    if (!rowCount) throw new HttpError(409, 'El utensilio no existe o no está disponible');
    const { rows } = await c.query(
      'INSERT INTO prestamos (utensilio_id, usuario_id) VALUES ($1, $2) RETURNING *', [utensilioId, usuarioId]);
    return rows[0];
  });
  res.status(201).json(prestamo);
}));

prestamos.post('/:id/devolver', wrap(async (req, res) => {
  const pid = id(req.params.id);
  await tx(async (c) => {
    const { rows } = await c.query(
      "UPDATE prestamos SET estado = 'Devuelto', fecha_devolucion = NOW() WHERE id = $1 AND estado = 'Activo' RETURNING utensilio_id", [pid]);
    if (!rows[0]) throw new HttpError(409, 'El préstamo no existe o ya fue devuelto');
    await c.query("UPDATE utensilios SET estado = 'Disponible' WHERE id = $1 AND estado = 'Prestado'", [rows[0].utensilio_id]);
  });
  res.json({ mensaje: 'Utensilio devuelto' });
}));

module.exports = { utensilios, prestamos };
