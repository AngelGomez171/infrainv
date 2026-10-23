'use strict';

class HttpError extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

/** Express 4 no captura promesas rechazadas: este wrapper las envía al error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const text = (v, { field, max = 100, required = true } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) { if (required) throw bad(`${field} es obligatorio`); return null; }
  if (s.length > max) throw bad(`${field} no puede superar ${max} caracteres`);
  return s;
};

const num = (v, { field, min = 0, max = 1e7, integer = false } = {}) => {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (v === '' || v === null || v === undefined || typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${field} debe ser un número`);
  if (n < min || n > max) throw bad(`${field} debe estar entre ${min} y ${max}`);
  if (integer && !Number.isInteger(n)) throw bad(`${field} debe ser un entero`);
  return n;
};

const date = (v, { field, required = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${field} es obligatoria`); return null; }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${field} debe tener formato AAAA-MM-DD`);
  return v;
};

const id = (v) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw bad('ID inválido');
  return n;
};

module.exports = { HttpError, bad, wrap, text, num, date, id };
