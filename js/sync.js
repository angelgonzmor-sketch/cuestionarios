(function () {
  'use strict';

  // ---------- Sincronizacion entre dispositivos ----------
  // Mismo patron que "Creador de horarios": la nube publica (MantleDB) guarda
  // { guardadoEn, estado: { version, materias, progreso } } y gana la ultima
  // escritura. Se sincroniza al abrir, al guardar cambios y al cerrar la pagina.
  // Sin panel, sin boton y sin sondeo periodico.

  var CLAVE_DATOS = 'cuestionarios.v2';
  var CLAVE_PROG = 'cuestionarios.progreso.v1';
  var CLAVE_TS = 'cuestionarios.sync.ts';
  var SYNC_URL = 'https://mantledb.sh/v2/cuestionarios-sync-1288324941e039dde11944d9ac70697a42a67c5b9cc8a8b0/estado';
  var SYNC_DELAY_MS = 1200;

  var syncTs = leerTs();
  var pushTimer = null, reintentos = 0, cambiosPendientes = false;

  function leerTs() {
    try { return parseInt(localStorage.getItem(CLAVE_TS) || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function guardarTs(ts) {
    try { localStorage.setItem(CLAVE_TS, String(ts)); } catch (e) {}
  }

  function setSyncStatus(txt) {
    var el = document.getElementById('sync-status');
    if (el) el.textContent = txt || '';
  }

  function onlineOk() {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
      ? true : navigator.onLine;
  }

  function cargarLocal() {
    if (window.Store && typeof Store.cargar === 'function') {
      try { return Store.cargar(); } catch (e) {}
    }
    try {
      var j = JSON.parse(localStorage.getItem(CLAVE_DATOS));
      if (j && Array.isArray(j.materias)) return j;
    } catch (e) {}
    return { version: 2, materias: [], tema: 'oscuro', borrador: null };
  }

  function progresoLocal() {
    if (window.Store && typeof Store.cargarProgresos === 'function') {
      try { return Store.cargarProgresos() || {}; } catch (e) {}
    }
    try { return JSON.parse(localStorage.getItem(CLAVE_PROG)) || {}; }
    catch (e) { return {}; }
  }

  function estadoLocal() {
    var d = cargarLocal();
    return {
      version: 2,
      materias: Array.isArray(d.materias) ? d.materias : [],
      progreso: progresoLocal()
    };
  }

  // Acepta el formato nuevo { estado: { materias, progreso } } y el viejo
  // { datos: { materias } } para no romper con lo que ya hubiera en la nube.
  function estadoDe(remoto) {
    if (!remoto) return null;
    var e = remoto.estado || remoto.datos || null;
    if (!e || typeof e !== 'object') return null;
    return {
      materias: Array.isArray(e.materias) ? e.materias : [],
      progreso: (e.progreso && typeof e.progreso === 'object') ? e.progreso : {}
    };
  }

  function tieneContenido(estado) {
    return !!(estado && (estado.materias.length > 0 || Object.keys(estado.progreso).length > 0));
  }

  // POST es el metodo normal de MantleDB. Si la red/antivirus lo bloquea
  // (405/403/501), se reintenta con PATCH, que tambien sobrescribe.
  function enviar(cuerpo) {
    var cab = { 'Content-Type': 'application/json' };
    return fetch(SYNC_URL, { method: 'POST', headers: cab, body: cuerpo }).then(function (r) {
      if (r.status === 405 || r.status === 403 || r.status === 501) {
        return fetch(SYNC_URL, { method: 'PATCH', headers: cab, body: cuerpo }).then(function (r2) {
          if (!r2.ok) throw new Error('POST/PATCH HTTP ' + r2.status);
          return r2;
        });
      }
      if (!r.ok) throw new Error('POST HTTP ' + r.status);
      return r;
    });
  }

  function programarPush(inmediato) {
    cambiosPendientes = true;
    clearTimeout(pushTimer);
    setSyncStatus('\u21c5 Subiendo\u2026');
    pushTimer = setTimeout(subirEstado, inmediato ? 200 : SYNC_DELAY_MS);
  }

  function subirEstado() {
    if (!onlineOk()) { setSyncStatus('\u26a0 Sin conexi\u00f3n'); return Promise.resolve(); }
    var guardadoEn = Date.now();
    var cuerpo = JSON.stringify({ guardadoEn: guardadoEn, estado: estadoLocal() });
    return enviar(cuerpo).then(function () {
      syncTs = guardadoEn;
      reintentos = 0;
      cambiosPendientes = false;
      guardarTs(syncTs);
      setSyncStatus('\u2713 Sincronizado');
    }).catch(function () {
      reintentos++;
      setSyncStatus('\u26a0 Sin conexi\u00f3n');
      if (reintentos <= 3) pushTimer = setTimeout(function () { programarPush(true); }, 8000);
    });
  }

  function adoptar(estado, ts) {
    var local = cargarLocal();
    var salida = {
      version: 2,
      materias: estado.materias,
      tema: (local.tema === 'claro' || local.tema === 'oscuro') ? local.tema : 'oscuro',
      borrador: local.borrador || null
    };
    try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(salida)); } catch (e) {}
    try {
      if (Object.keys(estado.progreso).length > 0) {
        localStorage.setItem(CLAVE_PROG, JSON.stringify(estado.progreso));
      } else {
        localStorage.removeItem(CLAVE_PROG);
      }
    } catch (e) {}
    syncTs = ts;
    cambiosPendientes = false;
    guardarTs(ts);
    if (window.AppSync && typeof AppSync.refrescar === 'function') AppSync.refrescar();
    else location.reload();
  }

  function iniciarSincronizacion() {
    if (!onlineOk()) { setSyncStatus('\u26a0 Sin conexi\u00f3n'); return Promise.resolve(); }
    return fetch(SYNC_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok && r.status !== 404) throw new Error('GET HTTP ' + r.status);
      return r.ok ? r.json() : null;
    }).then(function (remoto) {
      var estado = estadoDe(remoto);
      var tsRemoto = (remoto && remoto.guardadoEn) || 0;
      var localConDatos = tieneContenido(estadoLocal());

      if (estado && estado.materias.length > 0 && tsRemoto > syncTs) {
        adoptar(estado, tsRemoto);
        setSyncStatus('\u2713 Sincronizado');
      } else if (cambiosPendientes || tsRemoto < syncTs ||
                 (localConDatos && (!estado || estado.materias.length === 0))) {
        programarPush(true);
      } else {
        setSyncStatus('\u2713 Sincronizado');
      }
    }).catch(function () {
      if (syncTs === 0 && tieneContenido(estadoLocal())) programarPush(true);
      else setSyncStatus('');
    });
  }

  // Los cambios locales (materias y progreso) programan una subida.
  function enganchar() {
    if (!window.Store) return;
    ['guardar', 'guardarProgreso', 'limpiarProgreso', 'limpiarTodosProgresos'].forEach(function (nombre) {
      var original = Store[nombre];
      if (typeof original !== 'function') return;
      Store[nombre] = function () {
        var r = original.apply(Store, arguments);
        programarPush(false);
        return r;
      };
    });
  }

  function init() {
    enganchar();
    setSyncStatus(syncTs ? '\u2713 Sincronizado' : '');
    iniciarSincronizacion();
    addEventListener('beforeunload', function () {
      if (!cambiosPendientes) return;
      try {
        fetch(SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guardadoEn: Date.now(), estado: estadoLocal() }),
          keepalive: true
        });
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
