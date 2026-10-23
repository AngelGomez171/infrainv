'use strict';
/* INFRAINV · Frontend. Same-origin: el backend sirve este archivo y la API en /api */
const API = '/api';
const S = {
  me: null, alimentos: [], utensilios: [], prestamos: [], pedidos: [], alertas: [],
  usuarios: [], usuariosBasico: [], reportes: [], resumen: null,
  config: { dias_caducidad: 3 }, cal: new Date(),
};
const charts = {};
let notified = false;

/* ---------- Utilidades ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
function toLocalDateString(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const fmtDate = (s) => (s ? s.split('-').reverse().join('/') : '—');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(); const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
}
const emptyRow = (cols, msg = 'Sin registros') => `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`;
const isAdmin = () => S.me?.rol === 'Administrador';

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
  el.innerHTML = `<span>${icon}</span><span>${esc(message)}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 260); }, 3500);
}

function confirmDialog({ title = 'Confirmar acción', message = '¿Está seguro?', icon = '⚠️', okText = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-icon').textContent = icon;
    const ok = $('confirm-ok'); const cancel = $('confirm-cancel');
    ok.textContent = okText;
    const done = (v) => { $('confirm-overlay').classList.remove('show'); ok.onclick = cancel.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    $('confirm-overlay').classList.add('show');
  });
}

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Error de conexión con el servidor');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (res.status === 401 && !path.startsWith('/auth/login')) { logout(true); throw new Error('Tu sesión expiró. Inicia sesión de nuevo.'); }
  if (!res.ok) throw new Error(data?.mensaje || `Error ${res.status}`);
  return data;
}

/** Ejecuta una acción mostrando errores como toast y evitando doble envío. */
const running = new Set();
async function action(key, fn) {
  if (running.has(key)) return;
  running.add(key);
  try { await fn(); } catch (e) { showToast(e.message, 'error'); } finally { running.delete(key); }
}

/* ---------- Sesión ---------- */
async function login() {
  const email = $('login-correo').value.trim();
  const password = $('login-pass').value;
  if (!email || !password) return showToast('Ingresa correo y contraseña', 'warning');
  await action('login', async () => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('token', data.token);
    S.me = data.usuario;
    await enterApp();
  });
}

function logout(expired = false) {
  localStorage.removeItem('token');
  S.me = null; notified = false;
  $('app-view').style.display = 'none';
  $('login-view').style.display = 'flex';
  $('login-pass').value = '';
  if (expired === true) showToast('Sesión finalizada', 'info');
}

async function enterApp() {
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'block';
  $('topbar-user').textContent = S.me.nombre;
  $('topbar-role').textContent = S.me.rol;
  $('user-avatar').textContent = S.me.nombre.charAt(0).toUpperCase();
  document.querySelectorAll('[data-page="usuarios"], [data-page="config"]').forEach((b) => { b.style.display = isAdmin() ? '' : 'none'; });
  navigate('dashboard', document.querySelector('.sidebar [data-page="dashboard"]'));
  await loadAll();
}

/* ---------- Carga de datos ---------- */
async function loadAll() {
  try {
    const [alimentos, utensilios, prestamos, pedidos, alertas, resumen, reportes, config, basico] = await Promise.all([
      api('/alimentos'), api('/utensilios'), api('/prestamos'), api('/pedidos'), api('/alertas'),
      api('/reportes/resumen'), api('/reportes'), api('/config'), api('/usuarios/basico'),
    ]);
    Object.assign(S, { alimentos, utensilios, prestamos, pedidos, alertas, resumen, reportes, config, usuariosBasico: basico });
    if (isAdmin()) S.usuarios = await api('/usuarios');
    renderAll();
    maybeNotify();
  } catch (e) { showToast(e.message, 'error'); }
}

function renderAll() {
  renderDashboard(); renderAlimentos(); renderUtensilios(); renderPrestamos();
  renderCalendar(); renderPedidos(); renderAlertas(); renderReportes(); renderUsuarios();
  $('config-dias').value = S.config.dias_caducidad;
}

/* ---------- Navegación / UI ---------- */
function navigate(pageName, btn) {
  if ((pageName === 'usuarios' || pageName === 'config') && !isAdmin()) return showToast('Solo administradores', 'warning');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(`page-${pageName}`)?.classList.add('active');
  document.querySelectorAll('.sidebar button').forEach((b) => b.classList.remove('active'));
  (btn || document.querySelector(`.sidebar [data-page="${pageName}"]`))?.classList.add('active');
  $('global-search').value = ''; handleSearch('');
  if (window.innerWidth <= 768) closeSidebar();
}
const closeSidebar = () => { document.querySelector('.sidebar').classList.remove('open'); document.querySelector('.sidebar-backdrop').classList.remove('show'); };
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-backdrop').classList.toggle('show');
}
function toggleDarkMode(force) {
  const on = typeof force === 'boolean' ? force : !document.body.classList.contains('dark-mode');
  document.body.classList.toggle('dark-mode', on);
  $('dark-toggle').textContent = on ? '☀️' : '🌙';
  try { localStorage.setItem('dark', on ? '1' : '0'); } catch { /* storage bloqueado */ }
}
function handleSearch(q) {
  const term = q.trim().toLowerCase();
  document.querySelectorAll('.page.active tbody tr, .page.active .order-item, .page.active .alert-item').forEach((row) => {
    row.style.display = !term || row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
}

/* ---------- Modales ---------- */
const foodOptions = () => S.alimentos.map((a) => `<option value="${a.id}">${esc(a.nombre)} (${fmtNum(a.cantidad)} ${esc(a.unidad)})</option>`).join('')
  || '<option value="">— Sin platillos —</option>';

function openModal(id, preset = {}) {
  if (id === 'modal-food') {
    ['food-nombre', 'food-categoria', 'food-unidad', 'food-caducidad'].forEach((f) => { $(f).value = ''; });
    $('food-cantidad').value = 0; $('food-stockmin').value = 5; $('food-entrada').value = toLocalDateString(new Date());
  }
  if (id === 'modal-entry') { $('entry-food').innerHTML = foodOptions(); $('entry-qty').value = 1; if (preset.id) $('entry-food').value = preset.id; }
  if (id === 'modal-exit') { $('exit-food').innerHTML = foodOptions(); $('exit-qty').value = 1; if (preset.id) $('exit-food').value = preset.id; }
  if (id === 'modal-utensil') { ['ut-nombre', 'ut-codigo', 'ut-ubicacion'].forEach((f) => { $(f).value = ''; }); $('ut-estado').value = 'Disponible'; }
  if (id === 'modal-loan') {
    const libres = S.utensilios.filter((u) => u.estado === 'Disponible');
    $('loan-ut').innerHTML = libres.map((u) => `<option value="${u.id}">${esc(u.nombre)} (${esc(u.codigo)})</option>`).join('') || '<option value="">— Ninguno disponible —</option>';
    $('loan-user').innerHTML = S.usuariosBasico.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
    if (preset.id) $('loan-ut').value = preset.id;
    if (S.me) $('loan-user').value = S.me.id;
  }
  if (id === 'modal-order') { $('order-food').innerHTML = foodOptions(); $('order-qty').value = 1; $('order-notes').value = ''; }
  if (id === 'modal-user') { ['user-nombre', 'user-correo', 'user-pass'].forEach((f) => { $(f).value = ''; }); $('user-rol').value = 'Chef'; }
  $(id).classList.add('show');
}
const closeModal = (id) => $(id).classList.remove('show');

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const r = S.resumen || {};
  $('stat-alimentos').textContent = r.total_alimentos ?? 0;
  $('stat-bajo').textContent = r.stock_bajo ?? 0;
  $('stat-caducar').textContent = r.por_caducar ?? 0;
  $('stat-utensilios').textContent = r.utensilios_disponibles ?? 0;

  const sinLeer = S.alertas.filter((a) => !a.leida);
  $('dash-alert-chip').textContent = sinLeer.length;
  $('dashboard-alerts').innerHTML = S.alertas.slice(0, 5).map(alertHtml).join('') || '<p class="config-text">Sin alertas 🎉</p>';

  const activos = S.prestamos.filter((p) => p.estado === 'Activo');
  $('dash-loan-chip').textContent = activos.length;
  $('dashboard-loans').innerHTML = activos.slice(0, 5).map((p) =>
    `<div class="alert-item info"><span class="icon">📤</span><span class="msg"><b>${esc(p.utensilio)}</b> · ${esc(p.usuario)}<br><small>${fmtDateTime(p.fecha_prestamo)}</small></span></div>`
  ).join('') || '<p class="config-text">Sin préstamos activos</p>';

  drawCharts();
}

function drawCharts() {
  if (typeof Chart === 'undefined') return;
  const cats = S.resumen?.categorias || [];
  const palette = ['#b71c1c', '#f9a825', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  const mk = (id, cfg) => { charts[id]?.destroy(); const c = $(id); if (c) charts[id] = new Chart(c, cfg); };
  mk('chart-categorias', {
    type: 'doughnut',
    data: { labels: cats.map((c) => c.categoria), datasets: [{ data: cats.map((c) => c.cantidad), backgroundColor: palette }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });
  const top = [...S.alimentos].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8);
  mk('chart-stock', {
    type: 'bar',
    data: {
      labels: top.map((a) => a.nombre),
      datasets: [
        { label: 'Stock actual', data: top.map((a) => a.cantidad), backgroundColor: '#b71c1c' },
        { label: 'Mínimo', data: top.map((a) => a.stock_minimo), backgroundColor: '#f9a825' },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } },
  });
}

/* ---------- Platillos ---------- */
function estadoAlimento(a) {
  const d = daysUntil(a.fecha_caducidad);
  if (a.cantidad <= 0) return ['out', 'Agotado'];
  if (d !== null && d < 0) return ['critical', 'Caducado'];
  if (d !== null && d <= S.config.dias_caducidad) return ['low', 'Por caducar'];
  if (a.cantidad <= a.stock_minimo) return ['low', 'Stock bajo'];
  return ['ok', 'OK'];
}
function renderAlimentos() {
  $('tabla-alimentos').innerHTML = S.alimentos.map((a) => {
    const [cls, label] = estadoAlimento(a);
    return `<tr>
      <td><b>${esc(a.nombre)}</b></td><td>${esc(a.categoria)}</td><td>${fmtNum(a.cantidad)}</td><td>${esc(a.unidad)}</td>
      <td>${fmtDate(a.fecha_entrada)}</td><td>${fmtDate(a.fecha_caducidad)}</td><td>${fmtNum(a.stock_minimo)}</td>
      <td><span class="badge ${cls}">${label}</span></td>
      <td class="text-right">
        <button class="btn btn-sm btn-success" onclick="openModal('modal-entry',{id:${a.id}})">＋</button>
        <button class="btn btn-sm btn-secondary" onclick="openModal('modal-exit',{id:${a.id}})">－</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFood(${a.id})">🗑️</button>
      </td></tr>`;
  }).join('') || emptyRow(9, 'No hay platillos registrados');
}
const addFood = () => action('addFood', async () => {
  const body = {
    nombre: $('food-nombre').value, categoria: $('food-categoria').value, cantidad: $('food-cantidad').value,
    unidad: $('food-unidad').value, fecha_entrada: $('food-entrada').value || null,
    fecha_caducidad: $('food-caducidad').value || null, stock_minimo: $('food-stockmin').value,
  };
  await api('/alimentos', { method: 'POST', body });
  closeModal('modal-food'); showToast('Platillo guardado', 'success'); await loadAll();
});
const addEntry = () => action('entry', async () => {
  await api(`/alimentos/${$('entry-food').value}/entrada`, { method: 'POST', body: { cantidad: $('entry-qty').value } });
  closeModal('modal-entry'); showToast('Entrada registrada', 'success'); await loadAll();
});
const addExit = () => action('exit', async () => {
  await api(`/alimentos/${$('exit-food').value}/salida`, { method: 'POST', body: { cantidad: $('exit-qty').value } });
  closeModal('modal-exit'); showToast('Salida registrada', 'success'); await loadAll();
});
const deleteFood = (id) => action('delFood', async () => {
  if (!await confirmDialog({ title: 'Eliminar platillo', message: 'Se eliminarán también sus pedidos y movimientos.', icon: '🗑️', okText: 'Eliminar' })) return;
  await api(`/alimentos/${id}`, { method: 'DELETE' }); showToast('Platillo eliminado', 'success'); await loadAll();
});

/* ---------- Utensilios y préstamos ---------- */
const utBadge = { Disponible: 'ok', Prestado: 'loan', Extraviado: 'lost' };
function renderUtensilios() {
  $('tabla-utensilios').innerHTML = S.utensilios.map((u) => `<tr>
    <td><b>${esc(u.nombre)}</b></td><td>${esc(u.codigo)}</td><td>${esc(u.ubicacion || '—')}</td>
    <td><span class="badge ${utBadge[u.estado] || 'out'}">${esc(u.estado)}</span></td>
    <td class="text-right">
      ${u.estado === 'Disponible' ? `<button class="btn btn-sm btn-secondary" onclick="openModal('modal-loan',{id:${u.id}})">📤 Prestar</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="deleteUtensil(${u.id})">🗑️</button>
    </td></tr>`).join('') || emptyRow(5, 'No hay utensilios registrados');
}
const addUtensil = () => action('addUt', async () => {
  await api('/utensilios', { method: 'POST', body: {
    nombre: $('ut-nombre').value, codigo: $('ut-codigo').value, estado: $('ut-estado').value, ubicacion: $('ut-ubicacion').value } });
  closeModal('modal-utensil'); showToast('Utensilio guardado', 'success'); await loadAll();
});
const deleteUtensil = (id) => action('delUt', async () => {
  if (!await confirmDialog({ title: 'Eliminar utensilio', message: 'También se borrará su historial de préstamos.', icon: '🗑️', okText: 'Eliminar' })) return;
  await api(`/utensilios/${id}`, { method: 'DELETE' }); showToast('Utensilio eliminado', 'success'); await loadAll();
});
const addLoan = () => action('loan', async () => {
  await api('/prestamos', { method: 'POST', body: { utensilio_id: $('loan-ut').value, usuario_id: $('loan-user').value } });
  closeModal('modal-loan'); showToast('Préstamo registrado', 'success'); await loadAll();
});
const devolver = (id) => action('devolver', async () => {
  await api(`/prestamos/${id}/devolver`, { method: 'POST' }); showToast('Utensilio devuelto', 'success'); await loadAll();
});
function renderPrestamos() {
  const activos = S.prestamos.filter((p) => p.estado === 'Activo');
  const hist = S.prestamos.filter((p) => p.estado === 'Devuelto');
  $('loan-active-chip').textContent = activos.length;
  $('tabla-prestamos').innerHTML = activos.map((p) => `<tr>
    <td>${esc(p.utensilio)}</td><td>${esc(p.usuario)}</td><td>${fmtDateTime(p.fecha_prestamo)}</td>
    <td><span class="badge loan">${esc(p.estado)}</span></td>
    <td class="text-right"><button class="btn btn-sm btn-success" onclick="devolver(${p.id})">Devolver</button></td></tr>`
  ).join('') || emptyRow(5, 'No hay préstamos activos');
  $('tabla-historial').innerHTML = hist.map((p) => `<tr>
    <td>${esc(p.utensilio)}</td><td>${esc(p.usuario)}</td><td>${fmtDateTime(p.fecha_prestamo)}</td>
    <td>${fmtDateTime(p.fecha_devolucion)}</td><td><span class="badge ok">${esc(p.estado)}</span></td></tr>`
  ).join('') || emptyRow(5, 'Sin devoluciones');
}

/* ---------- Pedidos / calendario ---------- */
function renderCalendar() {
  const y = S.cal.getFullYear(); const m = S.cal.getMonth();
  const today = new Date(); const todayStr = toLocalDateString(today);
  $('calendar-month-label').textContent = S.cal.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  $('cal-prev').disabled = y === today.getFullYear() && m <= today.getMonth();
  const counts = {};
  S.pedidos.forEach((p) => { counts[p.fecha_pedido] = (counts[p.fecha_pedido] || 0) + 1; });
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // semana inicia en lunes
  const total = new Date(y, m + 1, 0).getDate();
  let html = '<div class="cal-day cal-day-empty"></div>'.repeat(offset);
  for (let d = 1; d <= total; d++) {
    const ds = toLocalDateString(new Date(y, m, d));
    const past = ds < todayStr; const n = counts[ds] || 0;
    const cls = ['cal-day', past && 'past', ds === todayStr && 'today', n && 'has-orders'].filter(Boolean).join(' ');
    html += `<div class="${cls}" ${past ? '' : `onclick="openOrderModal('${ds}')"`}>${d}${n ? `<span class="cal-day-badge">${n}</span>` : ''}</div>`;
  }
  $('calendar-grid').innerHTML = html;
}
function changeMonth(delta) { S.cal = new Date(S.cal.getFullYear(), S.cal.getMonth() + delta, 1); renderCalendar(); }
function goToToday() { S.cal = new Date(); renderCalendar(); }
function openOrderModal(dateStr) {
  if (dateStr < toLocalDateString(new Date())) return showToast('No se pueden programar pedidos en fechas pasadas', 'warning');
  if (!S.alimentos.length) return showToast('Primero registra al menos un platillo', 'warning');
  openModal('modal-order');
  $('order-date').value = dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  $('order-date-label').textContent = new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
const addOrder = () => action('order', async () => {
  await api('/pedidos', { method: 'POST', body: {
    alimento_id: $('order-food').value, cantidad: $('order-qty').value, fecha_pedido: $('order-date').value, notas: $('order-notes').value } });
  closeModal('modal-order'); showToast('Pedido programado', 'success'); await loadAll();
});
const completeOrder = (id) => action('compOrder', async () => {
  await api(`/pedidos/${id}/completar`, { method: 'POST' }); showToast('Pedido completado', 'success'); await loadAll();
});
const cancelOrder = (id) => action('cancOrder', async () => {
  if (!await confirmDialog({ title: 'Cancelar pedido', message: '¿Cancelar este pedido programado?', okText: 'Sí, cancelar' })) return;
  await api(`/pedidos/${id}`, { method: 'DELETE' }); showToast('Pedido cancelado', 'success'); await loadAll();
});
function renderPedidos() {
  $('orders-count-chip').textContent = S.pedidos.length;
  $('orders-list').innerHTML = S.pedidos.map((p) => `<div class="order-item">
    <div class="order-date">${fmtDate(p.fecha_pedido)}</div>
    <div class="order-title">${esc(p.platillo)}</div>
    <div class="order-meta">${fmtNum(p.cantidad)} ${esc(p.unidad)}</div>
    ${p.notas ? `<div class="order-notes">${esc(p.notas)}</div>` : ''}
    <div class="order-actions">
      <button class="btn btn-sm btn-success" onclick="completeOrder(${p.id})">✔ Completar (descuenta stock)</button>
      <button class="btn btn-sm btn-secondary" onclick="cancelOrder(${p.id})">Cancelar</button>
    </div></div>`).join('') || '<p class="config-text">No hay pedidos programados</p>';
}

/* ---------- Alertas ---------- */
const alertHtml = (a) => `<div class="alert-item ${a.nivel === 'danger' ? 'danger' : ''} ${a.leida ? 'read' : ''}">
  <span class="icon">${esc(a.icono)}</span><span class="msg">${esc(a.mensaje)}</span></div>`;
function renderAlertas() {
  $('lista-alertas').innerHTML = S.alertas.map(alertHtml).join('') || '<p class="config-text">No hay alertas 🎉</p>';
  const n = S.alertas.filter((a) => !a.leida).length;
  const badge = $('nav-alert-count');
  badge.textContent = n; badge.style.display = n ? '' : 'none';
}
const markAllAlertsRead = () => action('readAlerts', async () => {
  await api('/alertas/leer', { method: 'POST' }); showToast('Alertas marcadas como leídas', 'success'); await loadAll();
});
function requestNotificationPermission() {
  if (!('Notification' in window)) return showToast('Tu navegador no soporta notificaciones', 'warning');
  Notification.requestPermission().then((p) => {
    showToast(p === 'granted' ? 'Notificaciones activadas' : 'Notificaciones bloqueadas', p === 'granted' ? 'success' : 'warning');
    if (p === 'granted') maybeNotify();
  });
}
function maybeNotify() {
  const n = S.alertas.filter((a) => !a.leida).length;
  if (!notified && n && 'Notification' in window && Notification.permission === 'granted') {
    notified = true;
    new Notification('INFRAINV', { body: `Tienes ${n} alerta(s) de inventario sin leer` });
  }
}

/* ---------- Reportes ---------- */
const reporteTexto = (c) => `${c.total_alimentos} platillos · ${c.stock_bajo} stock bajo · ${c.por_caducar} por caducar · ${c.total_utensilios} utensilios (${c.prestados} prestados)`;
function renderReportes() {
  const r = S.resumen || {};
  $('rep-total-alim').textContent = r.total_alimentos ?? 0;
  $('rep-alertas').textContent = S.alertas.filter((a) => !a.leida).length;
  $('rep-total-ut').textContent = r.total_utensilios ?? 0;
  $('rep-prestados').textContent = r.prestados ?? 0;
  $('rep-categorias').innerHTML = (r.categorias || []).map((c) => `<tr><td>${esc(c.categoria)}</td><td>${c.cantidad}</td></tr>`).join('') || emptyRow(2);
  $('rep-historial').innerHTML = S.reportes.map((x) => `<tr><td>${esc(x.tipo)}</td><td>${fmtDateTime(x.creado_en)}</td><td>${esc(reporteTexto(x.contenido))}</td></tr>`).join('') || emptyRow(3, 'Aún no hay reportes generados');
}
const generateReport = () => action('genReport', async () => {
  await api('/reportes/generar', { method: 'POST' }); showToast('Reporte generado', 'success'); await loadAll();
});
function exportarReportePDF() {
  const lib = window.jspdf?.jsPDF;
  if (!lib) return showToast('No se pudo cargar la librería de PDF (revisa tu conexión)', 'error');
  const r = S.resumen || {}; const doc = new lib(); let y = 20;
  const line = (t, size = 11, gap = 8) => { doc.setFontSize(size); doc.text(String(t), 20, y); y += gap; if (y > 275) { doc.addPage(); y = 20; } };
  line('INFRAINV - Reporte de inventario', 18, 12);
  line(`Generado: ${new Date().toLocaleString('es')}  |  Por: ${S.me?.nombre || ''}`, 10, 12);
  line(`Total de platillos: ${r.total_alimentos ?? 0}`); line(`Stock bajo: ${r.stock_bajo ?? 0}`);
  line(`Próximos a caducar: ${r.por_caducar ?? 0}`); line(`Utensilios: ${r.total_utensilios ?? 0} (prestados: ${r.prestados ?? 0})`, 11, 12);
  line('Platillos por categoría', 13, 9);
  (r.categorias || []).forEach((c) => line(`• ${c.categoria}: ${c.cantidad}`));
  y += 4; line('Alertas activas', 13, 9);
  if (!S.alertas.length) line('Sin alertas');
  S.alertas.forEach((a) => line(`• ${a.mensaje}`.replace(/[^\x20-\x7EÁÉÍÓÚáéíóúñÑüÜ¿¡·•]/g, ''), 10, 7));
  doc.save(`reporte-infrainv-${toLocalDateString(new Date())}.pdf`);
}

/* ---------- Usuarios / configuración ---------- */
function renderUsuarios() {
  if (!isAdmin()) return;
  $('tabla-usuarios').innerHTML = S.usuarios.map((u) => `<tr>
    <td><b>${esc(u.nombre)}</b></td><td>${esc(u.email)}</td><td><span class="role-badge">${esc(u.rol)}</span></td>
    <td class="text-right">${u.id === S.me.id ? '' : `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️</button>`}</td></tr>`
  ).join('') || emptyRow(4);
}
const addUser = () => action('addUser', async () => {
  await api('/usuarios', { method: 'POST', body: {
    nombre: $('user-nombre').value, email: $('user-correo').value, password: $('user-pass').value, rol: $('user-rol').value } });
  closeModal('modal-user'); showToast('Usuario creado', 'success'); await loadAll();
});
const deleteUser = (id) => action('delUser', async () => {
  if (!await confirmDialog({ title: 'Eliminar usuario', message: 'El usuario perderá el acceso inmediatamente.', icon: '🗑️', okText: 'Eliminar' })) return;
  await api(`/usuarios/${id}`, { method: 'DELETE' }); showToast('Usuario eliminado', 'success'); await loadAll();
});
const saveConfig = () => action('config', async () => {
  await api('/config', { method: 'PUT', body: { dias_caducidad: $('config-dias').value } });
  showToast('Configuración guardada', 'success'); await loadAll();
});
const resetData = () => action('reset', async () => {
  if (!await confirmDialog({ title: 'Reiniciar sistema', message: 'Se borrarán platillos, utensilios, pedidos y préstamos y se restaurarán los datos de ejemplo. Los usuarios se conservan.', icon: '🗑️', okText: 'Reiniciar' })) return;
  await api('/admin/reset', { method: 'POST' }); showToast('Sistema reiniciado', 'success'); await loadAll();
});

/* ---------- Inicio ---------- */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); $('global-search').focus(); }
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach((m) => { if (m.id !== 'confirm-overlay') m.classList.remove('show'); else $('confirm-cancel').click(); });
});
document.querySelectorAll('.modal-overlay').forEach((ov) => ov.addEventListener('mousedown', (e) => {
  if (e.target === ov && ov.id !== 'confirm-overlay') ov.classList.remove('show');
}));

window.addEventListener('DOMContentLoaded', async () => {
  let dark = false; try { dark = localStorage.getItem('dark') === '1'; } catch { /* ignorar */ }
  toggleDarkMode(dark);
  $('dashboard-date').textContent = new Date().toLocaleDateString('es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (localStorage.getItem('token')) {
    try { S.me = (await api('/auth/me')).usuario; await enterApp(); } catch { logout(); }
  }
});
