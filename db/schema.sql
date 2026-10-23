-- =====================================================================
-- INFRAINV · Esquema PostgreSQL (idempotente: se puede ejecutar N veces)
-- Importar:  psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL,
    password   VARCHAR(255) NOT NULL,                 -- hash bcrypt
    rol        VARCHAR(20)  NOT NULL DEFAULT 'Inventario'
               CHECK (rol IN ('Administrador', 'Chef', 'Inventario')),
    activo     BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (LOWER(email));

CREATE TABLE IF NOT EXISTS alimentos (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120)  NOT NULL,
    categoria       VARCHAR(80)   NOT NULL DEFAULT 'General',
    cantidad        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    unidad          VARCHAR(30)   NOT NULL DEFAULT 'unidades',
    fecha_entrada   DATE          NOT NULL DEFAULT CURRENT_DATE,
    fecha_caducidad DATE,
    stock_minimo    NUMERIC(10,2) NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_alimentos_categoria ON alimentos (categoria);
CREATE INDEX IF NOT EXISTS ix_alimentos_caducidad ON alimentos (fecha_caducidad)
    WHERE fecha_caducidad IS NOT NULL;

CREATE TABLE IF NOT EXISTS movimientos (
    id          BIGSERIAL PRIMARY KEY,
    alimento_id INTEGER       NOT NULL REFERENCES alimentos (id) ON DELETE CASCADE,
    tipo        VARCHAR(10)   NOT NULL CHECK (tipo IN ('Entrada', 'Salida')),
    cantidad    NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
    usuario_id  INTEGER       REFERENCES usuarios (id) ON DELETE SET NULL,
    fecha       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_movimientos_alimento ON movimientos (alimento_id, fecha DESC);

CREATE TABLE IF NOT EXISTS utensilios (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(120) NOT NULL,
    codigo    VARCHAR(40)  NOT NULL UNIQUE,
    ubicacion VARCHAR(120),
    estado    VARCHAR(20)  NOT NULL DEFAULT 'Disponible'
              CHECK (estado IN ('Disponible', 'Prestado', 'Extraviado')),
    creado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prestamos (
    id               SERIAL PRIMARY KEY,
    utensilio_id     INTEGER     NOT NULL REFERENCES utensilios (id) ON DELETE CASCADE,
    usuario_id       INTEGER     NOT NULL REFERENCES usuarios (id)   ON DELETE CASCADE,
    fecha_prestamo   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_devolucion TIMESTAMPTZ,
    estado           VARCHAR(10) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Devuelto'))
);
-- Un utensilio solo puede tener UN préstamo activo a la vez
CREATE UNIQUE INDEX IF NOT EXISTS ux_prestamo_activo ON prestamos (utensilio_id) WHERE estado = 'Activo';
CREATE INDEX IF NOT EXISTS ix_prestamos_usuario ON prestamos (usuario_id);
CREATE INDEX IF NOT EXISTS ix_prestamos_fecha   ON prestamos (fecha_prestamo DESC);

CREATE TABLE IF NOT EXISTS pedidos (
    id           SERIAL PRIMARY KEY,
    alimento_id  INTEGER       NOT NULL REFERENCES alimentos (id) ON DELETE CASCADE,
    cantidad     NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
    fecha_pedido DATE          NOT NULL,
    notas        TEXT,
    estado       VARCHAR(12)   NOT NULL DEFAULT 'Pendiente'
                 CHECK (estado IN ('Pendiente', 'Completado', 'Cancelado')),
    usuario_id   INTEGER       REFERENCES usuarios (id) ON DELETE SET NULL,
    creado_en    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_pendientes ON pedidos (fecha_pedido) WHERE estado = 'Pendiente';

CREATE TABLE IF NOT EXISTS alertas_leidas (
    usuario_id INTEGER      NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    clave      VARCHAR(80)  NOT NULL,
    leida_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, clave)
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave VARCHAR(60) PRIMARY KEY,
    valor TEXT NOT NULL
);
INSERT INTO configuracion (clave, valor) VALUES ('dias_caducidad', '3')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS reportes (
    id         SERIAL PRIMARY KEY,
    tipo       VARCHAR(40) NOT NULL DEFAULT 'Inventario',
    contenido  JSONB       NOT NULL,
    usuario_id INTEGER     REFERENCES usuarios (id) ON DELETE SET NULL,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_reportes_fecha ON reportes (creado_en DESC);
