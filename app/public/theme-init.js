/* Aplica el tema antes de pintar la página (evita el destello blanco en modo oscuro). */
(function () {
  try {
    var pref = localStorage.getItem('campus_theme') || 'system'
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) { /* sin almacenamiento: tema claro */ }
})();

/* Preferencias de lectura (Ajustes): texto grande, menos movimiento y alto contraste. */
(function () {
  try {
    var r = JSON.parse(localStorage.getItem('campus-reading') || '{}')
    var c = document.documentElement.classList
    if (r.largeText) c.add('text-large')
    if (r.reduceMotion) c.add('motion-off')
    if (r.highContrast) c.add('contrast-high')
  } catch (e) { /* sin almacenamiento */ }
})();
