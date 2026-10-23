-- Datos de ejemplo (fechas relativas a hoy para que se vean alertas). No toca usuarios.
INSERT INTO alimentos (nombre, categoria, cantidad, unidad, fecha_entrada, fecha_caducidad, stock_minimo) VALUES
 ('Pizza Margarita',   'Platos fuertes', 24, 'porciones', CURRENT_DATE - 2, CURRENT_DATE + 2,  10),
 ('Ensalada César',    'Entradas',        6, 'porciones', CURRENT_DATE - 1, CURRENT_DATE + 1,  8),
 ('Sopa de tomate',    'Entradas',       18, 'porciones', CURRENT_DATE - 3, CURRENT_DATE + 10, 6),
 ('Pastel de chocolate','Postres',       12, 'porciones', CURRENT_DATE - 1, CURRENT_DATE + 5,  5),
 ('Pollo a la plancha','Platos fuertes',  0, 'porciones', CURRENT_DATE - 4, CURRENT_DATE - 1,  8),
 ('Limonada natural',  'Bebidas',        30, 'vasos',     CURRENT_DATE,     CURRENT_DATE + 30, 10);
INSERT INTO utensilios (nombre, codigo, ubicacion, estado) VALUES
 ('Cuchillo chef',   'UT-001', 'Cocina caliente', 'Disponible'),
 ('Batidora',        'UT-002', 'Repostería',      'Disponible'),
 ('Sartén antiadherente', 'UT-003', 'Cocina caliente', 'Disponible'),
 ('Tabla de cortar', 'UT-004', 'Cocina fría',     'Disponible');
