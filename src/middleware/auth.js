'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { HttpError, wrap } = require('../utils');

/** Exige un JWT válido y que el usuario siga existiendo y activo. */
const authRequired = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Autenticación requerida');
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }
  const { rows } = await query('SELECT id, nombre, email, rol FROM usuarios WHERE id = $1 AND activo', [payload.id]);
  if (!rows[0]) throw new HttpError(401, 'Usuario no autorizado');
  req.user = rows[0];
  next();
});

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.rol) ? next() : next(new HttpError(403, 'No tienes permisos para esta acción'));

module.exports = { authRequired, requireRole };
