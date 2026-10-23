'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const { HttpError, bad, wrap } = require('../utils');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

// Hash falso para igualar tiempos de respuesta cuando el usuario no existe
const DUMMY_HASH = bcrypt.hashSync('no-existe', 10);

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) throw bad('Faltan datos');

  const { rows } = await query(
    'SELECT id, nombre, email, password, rol FROM usuarios WHERE LOWER(email) = $1 AND activo', [email]);
  const u = rows[0];
  const valida = await bcrypt.compare(password, u ? u.password : DUMMY_HASH);
  if (!u || !valida) throw new HttpError(401, 'Correo o contraseña incorrectos'); // mismo mensaje: no revela si existe

  const token = jwt.sign({ id: u.id, rol: u.rol }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  res.json({
    mensaje: 'Login exitoso',
    token,
    usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
  });
}));

router.get('/me', authRequired, (req, res) => res.json({ usuario: req.user }));

module.exports = router;
