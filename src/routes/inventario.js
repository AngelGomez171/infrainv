'use strict';
const router = require('express').Router();
const { query, tx } = require('../db');
const { HttpError, wrap, text, num, date, id } = require('../utils');

router.get('/', wrap(async (_req, res) => {
  const { rows } = await query('SELECT * FROM alimentos ORDER BY nombre');
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const nombre = text(b.nombre, { field: 'El nombre', max: 120 });
  const categoria = text(b.categoria, { field: 'La categoría', max: 80, required: false }) || 'General';
  const cantidad = num(b.cantidad ?? 0, { field: 'La cantidad' });
  const unidad = text(b.unidad, { field: 'La unidad', max: 30, required: false }) || 'unidades';
  const entrada = date(b.fecha_entrada, { field: 'La fecha de entrada' });
  const caducidad = date(b.fecha_caducidad, { field: 'La fecha de caducidad' });
  const stockMin = num(b.stock_minimo ?? 5, { field: 'El stock mínimo' });

  const { rows } = await query(
    `INSERT INTO alimentos (nombre, categoria, cantidad, unidad, fecha_entrada, fecha_caducidad, stock_minimo)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, $7) RETURNING *`,
    [nombre, categoria, cantidad, unidad, entrada, caducidad, stockMin]);
  res.status(201).json(rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM alimentos WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Platillo no encontrado');
  res.json({ mensaje: 'Platillo eliminado' });
}));

/** Registra entrada/salida de forma atómica (evita stock negativo aun con concurrencia). */
async function moverStock(client, alimentoId, tipo, cantidad, usuarioId) {
  const sql = tipo === 'Entrada'
    ? 'UPDATE alimentos SET cantidad = cantidad + $1 WHERE id = $2 RETURNING *'
    : 'UPDATE alimentos SET cantidad = cantidad - $1 WHERE id = $2 AND cantidad >= $1 RETURNING *';
  const { rows } = await client.query(sql, [cantidad, alimentoId]);
  if (!rows[0]) {
    const { rowCount } = await client.query('SELECT 1 FROM alimentos WHERE id = $1', [alimentoId]);
    throw rowCount ? new HttpError(409, 'Stock insuficiente para registrar la salida') : new HttpError(404, 'Platillo no encontrado');
  }
  await client.query(
    'INSERT INTO movimientos (alimento_id, tipo, cantidad, usuario_id) VALUES ($1, $2, $3, $4)',
    [alimentoId, tipo, cantidad, usuarioId]);
  return rows[0];
}

const movimiento = (tipo) => wrap(async (req, res) => {
  const alimentoId = id(req.params.id);
  const cantidad = num(req.body?.cantidad, { field: 'La cantidad', min: 0.01 });
  const alimento = await tx((c) => moverStock(c, alimentoId, tipo, cantidad, req.user.id));
  res.json(alimento);
});
router.post('/:id/entrada', movimiento('Entrada'));
router.post('/:id/salida', movimiento('Salida'));

module.exports = router;
module.exports.moverStock = moverStock;
