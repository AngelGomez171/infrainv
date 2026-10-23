'use strict';
const router = require('express').Router();
const { query, tx } = require('../db');
const { moverStock } = require('./inventario');
const { HttpError, wrap, text, num, date, id } = require('../utils');

// Pedidos pendientes de hoy en adelante
router.get('/', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT p.id, p.alimento_id, a.nombre AS platillo, a.unidad, p.cantidad, p.fecha_pedido, p.notas, p.estado
    FROM pedidos p JOIN alimentos a ON a.id = p.alimento_id
    WHERE p.estado = 'Pendiente' AND p.fecha_pedido >= CURRENT_DATE
    ORDER BY p.fecha_pedido, p.id`);
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const alimentoId = id(b.alimento_id);
  const cantidad = num(b.cantidad, { field: 'La cantidad', min: 0.01 });
  const fecha = date(b.fecha_pedido, { field: 'La fecha', required: true });
  const notas = text(b.notas, { field: 'Las notas', max: 500, required: false });

  const { rows: hoy } = await query('SELECT CURRENT_DATE::text AS d');
  if (fecha < hoy[0].d) throw new HttpError(400, 'No se pueden programar pedidos en fechas pasadas');

  const { rows } = await query(
    `INSERT INTO pedidos (alimento_id, cantidad, fecha_pedido, notas, usuario_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [alimentoId, cantidad, fecha, notas, req.user.id]);
  res.status(201).json(rows[0]);
}));

// Completar = registrar la salida de stock y cerrar el pedido (atómico)
router.post('/:id/completar', wrap(async (req, res) => {
  const pid = id(req.params.id);
  await tx(async (c) => {
    const { rows } = await c.query("SELECT * FROM pedidos WHERE id = $1 AND estado = 'Pendiente' FOR UPDATE", [pid]);
    if (!rows[0]) throw new HttpError(404, 'Pedido no encontrado o ya procesado');
    await moverStock(c, rows[0].alimento_id, 'Salida', rows[0].cantidad, req.user.id);
    await c.query("UPDATE pedidos SET estado = 'Completado' WHERE id = $1", [pid]);
  });
  res.json({ mensaje: 'Pedido completado y stock actualizado' });
}));

router.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query(
    "UPDATE pedidos SET estado = 'Cancelado' WHERE id = $1 AND estado = 'Pendiente'", [id(req.params.id)]);
  if (!rowCount) throw new HttpError(404, 'Pedido no encontrado o ya procesado');
  res.json({ mensaje: 'Pedido cancelado' });
}));

module.exports = router;
