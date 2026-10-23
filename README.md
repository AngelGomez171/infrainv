# INFRAINV · Sistema de Inventario Gastronómico

Node.js + Express + PostgreSQL. El mismo servidor entrega el frontend (`/public`) y la API (`/api`),
así que no hay CORS ni URLs que configurar.

```
server.js            arranque, seguridad (helmet), rutas, manejo de errores, cierre limpio
src/config.js        lectura y validación estricta de variables de entorno
src/db.js            Pool de pg, reintentos, transacciones, migraciones
src/bootstrap.js     migración automática + creación del admin inicial
src/routes/*.js      auth, usuarios, alimentos, utensilios/préstamos, pedidos, alertas/config/reportes
db/schema.sql        estructura de la BD (idempotente)
db/seed_demo.sql     datos de ejemplo
public/              index.html, app.js, styles.css
render.yaml          Blueprint de Render
```

## Ejecutar en local
```bash
cp .env.example .env        # completa DATABASE_URL, JWT_SECRET y ADMIN_PASSWORD
npm install
npm start                   # http://localhost:3000
```
Con `AUTO_MIGRATE=true` (por defecto) las tablas se crean solas. También puedes hacerlo a mano:
`psql "$DATABASE_URL" -f db/schema.sql` (y opcionalmente `db/seed_demo.sql`).

## Desplegar en Render

### Opción A · Blueprint (1 clic)
1. Sube el proyecto a GitHub (el `.gitignore` ya excluye `.env` y `node_modules`).
2. Render → **New → Blueprint** → elige el repo. Lee `render.yaml` y crea BD + servicio.
3. Cuando termine, entra a **infrainv → Environment** y copia el valor de `ADMIN_PASSWORD`.
4. Abre la URL pública e inicia sesión con `admin@infrainv.com`.

### Opción B · Manual
1. **New → PostgreSQL** (anota la *Internal Database URL*).
2. **New → Web Service** → tu repo. Runtime *Node*, Build `npm ci`, Start `npm start`, Health Check Path `/health`.
3. Variables de entorno: `DATABASE_URL` (la interna), `JWT_SECRET` (≥32 caracteres), `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, `NODE_ENV=production`, `APP_TIMEZONE`.
4. Deploy. El esquema se crea automáticamente al primer arranque.

> Si te conectas desde tu PC a la BD de Render usa la *External URL* y `DB_SSL=true`.

### Notas del plan gratuito
Verifica las condiciones vigentes de Render: el servicio web gratuito se suspende por inactividad
(el primer acceso tarda en "despertar") y la base PostgreSQL gratuita tiene vencimiento.
Para uso real, usa planes de pago.

## Seguridad aplicada
- Sin secretos en el código; el servidor **no arranca** si falta `JWT_SECRET` o la config de BD.
- JWT en cada ruta de `/api` (salvo login), validando que el usuario siga activo; roles `Administrador / Chef / Inventario`.
- Rate-limit en el login, `helmet` + CSP, consultas 100 % parametrizadas, escape de HTML en el frontend.
- Contraseñas con bcrypt; el login no revela si el correo existe.
- Operaciones de stock y préstamos atómicas (transacciones), sin stock negativo ni dobles préstamos.
