(function () {
  'use strict';

  // ---------- Sincronizacion entre dispositivos (estilo MantleDB) ----------
  // El estado (materias) se guarda en una clave publica de MantleDB. Cualquier
  // dispositivo con internet lee y escribe la ultima version (last-write-wins).
  var CLAVE = 'cuestionarios.v2';
  var CLAVE_URL = 'cuestionarios.sync.url';
  var CLAVE_TS = 'cuestionarios.sync.ts';
  var CLAVE_TS_URL = 'cuestionarios.sync.tsUrl';
  var SYNC_URL_POR_DEFECTO = 'https://mantledb.sh/v2/cuestionarios-sync-1288324941e039dde11944d9ac70697a42a67c5b9cc8a8b0/estado';
  var SYNC_DELAY_MS = 1200;

  function urlSync() {
    try { return localStorage.getItem(CLAVE_URL) || SYNC_URL_POR_DEFECTO; }
    catch (e) { return SYNC_URL_POR_DEFECTO; }
  }
  var SYNC_URL = urlSync();

  // El timestamp guardado solo vale si pertenece a la misma clave. Si cambio la
  // clave, se reinicia para no bloquear la primera subida a la nube nueva.
  function leerTs() {
    try {
      var ts = parseInt(localStorage.getItem(CLAVE_TS) || '0', 10) || 0;
      var u = localStorage.getItem(CLAVE_TS_URL);
      if (u && u !== SYNC_URL) return 0;
      return ts;
    } catch (e) { return 0; }
  }
  function guardarTs(ts) {
    try {
      localStorage.setItem(CLAVE_TS, String(ts));
      localStorage.setItem(CLAVE_TS_URL, SYNC_URL);
    } catch (e) {}
  }

  var syncTs = leerTs();
  var syncTimer = null, syncRetries = 0, syncPending = false;
  var ultimoError = '';

  function onlineOk() {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
      ? true : navigator.onLine;
  }

  function setSyncStatus(txt) {
    var el = document.getElementById('sync-status');
    if (el) el.textContent = txt || '';
  }

  function leerLocal() {
    if (window.Store && typeof Store.cargar === 'function') return Store.cargar();
    try {
      var j = JSON.parse(localStorage.getItem(CLAVE));
      if (j && Array.isArray(j.materias)) return j;
    } catch (e) {}
    return { version: 2, materias: [], tema: 'oscuro', borrador: null };
  }

  function localMaterias() {
    var d = leerLocal();
    return Array.isArray(d.materias) ? d.materias : [];
  }

  function blob() {
    return { version: 2, materias: localMaterias() };
  }

  // Escribe el estado. Usa POST (metodo oficial de MantleDB) y, si un filtro de
  // red/antivirus lo bloquea (405/403), reintenta con PATCH (tambien sobrescribe).
  async function enviar(cuerpo) {
    var cab = { 'Content-Type': 'application/json' };
    var r = await fetch(SYNC_URL, { method: 'POST', headers: cab, body: cuerpo });
    if (r.status === 405 || r.status === 403 || r.status === 501) {
      r = await fetch(SYNC_URL, { method: 'PATCH', headers: cab, body: cuerpo });
      if (!r.ok) throw new Error('POST/PATCH HTTP ' + r.status + ' (tu red o antivirus bloquea la escritura)');
      return r;
    }
    if (!r.ok) throw new Error('POST HTTP ' + r.status);
    return r;
  }

  // Acepta tanto { datos: { materias } } (formato nuevo) como { materias } (viejo).
  function materiasDe(remoto) {
    if (!remoto) return null;
    var cuerpo = remoto.datos || remoto;
    return Array.isArray(cuerpo.materias) ? cuerpo.materias : null;
  }

  // ---------- subida ----------
  function schedule(immediate) {
    syncPending = true;
    clearTimeout(syncTimer);
    setSyncStatus('\u21c5 Subiendo\u2026');
    syncTimer = setTimeout(pushState, immediate ? 200 : SYNC_DELAY_MS);
  }

  async function pushState() {
    if (!onlineOk()) { setSyncStatus('\u26a0 Sin conexi\u00f3n'); ultimoError = 'Sin red (navigator.onLine = false).'; return; }
    try {
      var cur = await fetch(SYNC_URL, { cache: 'no-store' }).catch(function (e) { throw new Error('GET ' + e.message); });
      var remoto = cur.ok ? await cur.json() : null;
      var tsRemote = (remoto && remoto.guardadoEn) || 0;
      var remotas = materiasDe(remoto);

      if (tsRemote > syncTs && remotas && remotas.length > 0) { adoptar(remotas, tsRemote); return; }
      if (localMaterias().length === 0 && remotas && remotas.length > 0) {
        adoptar(remotas, tsRemote);
        return;
      }

      var guardadoEn = Date.now();
      await enviar(JSON.stringify({ guardadoEn: guardadoEn, datos: blob() }));
      syncTs = guardadoEn;
      syncRetries = 0;
      syncPending = false;
      ultimoError = '';
      guardarTs(syncTs);
      setSyncStatus('\u2713 Sincronizado');
    } catch (e) {
      syncRetries++;
      ultimoError = e.message;
      setSyncStatus('\u26a0 Sin conexi\u00f3n');
      if (syncRetries <= 3) syncTimer = setTimeout(function () { schedule(true); }, 8000);
    }
  }

  // ---------- bajada ----------
  async function pullSync() {
    if (!onlineOk()) { ultimoError = 'Sin red.'; return; }
    try {
      var r = await fetch(SYNC_URL, { cache: 'no-store' });
      if (!r.ok && r.status !== 404) throw new Error('GET HTTP ' + r.status);
      var remoto = r.ok ? await r.json() : null;
      var tsRemote = (remoto && remoto.guardadoEn) || 0;
      var remotas = materiasDe(remoto);
      ultimoError = '';

      if (tsRemote > syncTs && remotas && remotas.length > 0) {
        adoptar(remotas, tsRemote);
        setSyncStatus('\u2713 Sincronizado');
      } else if (syncPending || tsRemote < syncTs || (tsRemote > syncTs && localMaterias().length > 0)) {
        schedule(true);
      } else {
        setSyncStatus('\u2713 Sincronizado');
      }
    } catch (e) {
      ultimoError = e.message;
      if (syncTs === 0 && localMaterias().length > 0) schedule(true);
      else setSyncStatus('');
    }
  }

  function adoptar(materias, ts) {
    if (materias.length === 0 && localMaterias().length > 0) return;
    var local = leerLocal();
    var salida = {
      version: 2,
      materias: materias,
      tema: (local.tema === 'claro' || local.tema === 'oscuro') ? local.tema : 'oscuro',
      borrador: local.borrador || null
    };
    try { localStorage.setItem(CLAVE, JSON.stringify(salida)); } catch (e) {}
    syncTs = ts;
    syncPending = false;
    guardarTs(ts);
    if (window.AppSync && typeof AppSync.refrescar === 'function') AppSync.refrescar();
    else location.reload();
  }

  // ---------- enganche al guardado local ----------
  function enganchar() {
    if (!window.Store || typeof Store.guardar !== 'function') return;
    var original = Store.guardar;
    Store.guardar = function () {
      var r = original.apply(Store, arguments);
      schedule(false);
      return r;
    };
  }

  // ---------- interfaz ----------
  var boton;
  var overlay = null, caja = null, mensaje = null;

  function inyectarUI() {
    var cont = document.querySelector('.barra-acciones');
    if (!cont) return;
    boton = document.createElement('button');
    boton.id = 'btnSync';
    boton.type = 'button';
    boton.className = 'sec';
    boton.title = 'Sincronizaci\u00f3n entre dispositivos';
    boton.textContent = '\u2601 Sincronizar';
    boton.addEventListener('click', abrirPanel);
    cont.insertBefore(boton, cont.firstChild);

    var sp = document.createElement('span');
    sp.id = 'sync-status';
    sp.style.cssText = 'font-size:11px;font-weight:600;opacity:.7;white-space:nowrap;margin:0 8px;';
    cont.insertBefore(sp, boton.nextSibling);
  }

  function crearPanel() {
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9999;';
    caja = document.createElement('div');
    caja.style.cssText = 'background:var(--fondo,#1b1b1f);color:var(--texto,#eee);border:1px solid rgba(128,128,128,.4);border-radius:12px;padding:20px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.5);font:14px/1.4 system-ui,sans-serif;';
    overlay.appendChild(caja);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrarPanel(); });
    document.body.appendChild(overlay);
  }

  function elem(tag, css, texto) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function botonPanel(texto, clase, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.className = clase || 'sec';
    b.style.cssText = 'margin:6px 6px 0 0;padding:8px 12px;border-radius:8px;cursor:pointer;';
    b.addEventListener('click', fn);
    return b;
  }

  function abrirPanel() {
    if (!overlay) crearPanel();
    renderPanel();
    overlay.style.display = 'flex';
  }
  function cerrarPanel() { if (overlay) overlay.style.display = 'none'; }

  function renderPanel() {
    caja.innerHTML = '';
    caja.appendChild(elem('h3', 'margin:0 0 10px;font-size:16px;', '\u2601 Sincronizaci\u00f3n entre dispositivos'));

    caja.appendChild(elem('p', 'margin:0 0 8px;font-size:12px;opacity:.8;', 'El estado se guarda en una nube p\u00fablica (MantleDB) y todos tus dispositivos comparten la \u00faltima versi\u00f3n. No depende de este ordenador.'));

    var estadoTxt = document.getElementById('sync-status');
    caja.appendChild(elem('p', 'margin:0 0 4px;font-size:12px;',
      'Estado: ' + (estadoTxt && estadoTxt.textContent ? estadoTxt.textContent : (syncTs ? '\u2713 Sincronizado' : 'sin datos a\u00fan')) +
      (syncTs ? ' \u00b7 ' + new Date(syncTs).toLocaleString() : '')));

    caja.appendChild(elem('p', 'margin:0 0 4px;font-size:12px;opacity:.75;', 'Materias en este dispositivo: ' + localMaterias().length));

    if (ultimoError) caja.appendChild(elem('p', 'margin:0 0 4px;font-size:12px;color:#e5484d;', 'Último error: ' + ultimoError));

    caja.appendChild(elem('p', 'margin:6px 0 4px;font-size:12px;opacity:.7;word-break:break-all;', 'Clave: ' + SYNC_URL));

    var acc = elem('div', 'margin-top:8px;');
    acc.appendChild(botonPanel('Forzar sincronizaci\u00f3n', 'pri', function () {
      mensaje = '\u2026'; renderPanel();
      pullSync().then(function () {
        if (!syncPending) schedule(true);
        mensaje = 'Sincronizaci\u00f3n lanzada.';
        renderPanel();
      });
    }));
    acc.appendChild(botonPanel('Probar conexi\u00f3n', 'sec', async function () {
      mensaje = 'Probando\u2026'; renderPanel();
      try {
        var r = await fetch(SYNC_URL, { cache: 'no-store' });
        if (r.status === 404) mensaje = 'Lectura OK. La nube a\u00fan no tiene datos.';
        else if (r.ok) {
          var j = await r.json();
          var mm = j && j.datos ? j.datos.materias : (j && j.materias);
          mensaje = 'Lectura OK. La nube tiene ' + (Array.isArray(mm) ? mm.length : 0) + ' materia(s).';
        } else {
          mensaje = 'La nube respondi\u00f3 HTTP ' + r.status + '.';
        }
      } catch (e) {
        mensaje = 'Sin conexi\u00f3n con la nube: ' + e.message;
      }
      renderPanel();
    }));
    acc.appendChild(botonPanel('Probar escritura', 'sec', async function () {
      mensaje = 'Probando escritura\u2026'; renderPanel();
      try {
        var g = await fetch(SYNC_URL, { cache: 'no-store' });
        var remoto = g.ok ? await g.json() : null;
        if (!remoto) {
          mensaje = 'No hay datos en la nube; guarda algo en la app para probar.';
        } else {
          await enviar(JSON.stringify(remoto));
          mensaje = 'Escritura OK.';
        }
      } catch (e) {
        mensaje = 'Escritura FALL\u00d3: ' + e.message;
      }
      renderPanel();
    }));
    acc.appendChild(botonPanel('Cerrar', 'sec', cerrarPanel));
    caja.appendChild(acc);

    caja.appendChild(elem('p', 'margin:14px 0 4px;font-size:12px;opacity:.7;', 'Cambiar clave (debe ser la misma en todos tus dispositivos):'));
    var inp = elem('input', 'width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;');
    inp.type = 'text';
    inp.value = SYNC_URL;
    caja.appendChild(inp);
    var acc2 = elem('div', 'margin-top:8px;');
    acc2.appendChild(botonPanel('Guardar clave', 'sec', function () {
      var v = (inp.value || '').trim();
      if (!v) return;
      try { localStorage.setItem(CLAVE_URL, v); } catch (e) {}
      SYNC_URL = v; syncTs = 0; guardarTs(0);
      cerrarPanel();
      pullSync().then(function () { if (!syncPending) schedule(true); });
    }));
    acc2.appendChild(botonPanel('Clave por defecto', 'sec', function () {
      try { localStorage.removeItem(CLAVE_URL); } catch (e) {}
      SYNC_URL = SYNC_URL_POR_DEFECTO; syncTs = 0; guardarTs(0);
      cerrarPanel();
      pullSync();
    }));
    caja.appendChild(acc2);

    if (mensaje) caja.appendChild(elem('p', 'margin:12px 0 0;font-size:12px;', mensaje));
  }

  // ---------- arranque ----------
  function init() {
    inyectarUI();
    enganchar();
    setSyncStatus(syncTs ? '\u2713 Sincronizado' : '');
    pullSync();
    setInterval(pullSync, 30000);
    addEventListener('online', function () { pullSync(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pullSync();
    });
    addEventListener('beforeunload', function () {
      if (syncPending) {
        try {
          fetch(SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guardadoEn: Date.now(), datos: blob() }),
            keepalive: true
          });
        } catch (e) {}
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
