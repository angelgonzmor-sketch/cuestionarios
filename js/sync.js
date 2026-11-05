(function () {
  'use strict';

  // ---------- Sincronizacion entre dispositivos ----------
  // Mismo patron que "Creador de horarios": la nube publica (MantleDB) guarda
  // { guardadoEn, datos: { version, materias, progreso } } y gana la ultima
  // escritura. Se conserva el campo "datos" (en vez de "estado") para que las
  // versiones antiguas de la app, aun en cache, tambien puedan leer las materias.
  // Se sincroniza al abrir, al guardar cambios y al cerrar la pagina.

  var CLAVE_DATOS = 'cuestionarios.v2';
  var CLAVE_PROG = 'cuestionarios.progreso.v1';
  var CLAVE_TS = 'cuestionarios.sync.ts';
  var CLAVE_TS_URL = 'cuestionarios.sync.tsUrl';
  var SYNC_URL = 'https://mantledb.sh/v2/cuestionarios-sync-1288324941e039dde11944d9ac70697a42a67c5b9cc8a8b0/estado';
  var SYNC_DELAY_MS = 1200;

  var syncTs = leerTs();
  var pushTimer = null, reintentos = 0, cambiosPendientes = false;

  function leerTs() {
    try {
      var ts = parseInt(localStorage.getItem(CLAVE_TS) || '0', 10) || 0;
      // Si el timestamp viene de otra clave/nube, no es comparable: se ignora.
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

  function setSyncStatus(txt, detalle) {
    var el = document.getElementById('sync-status');
    if (el) {
      el.textContent = txt || '';
      el.title = detalle || '';
    }
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

  // Acepta el formato actual { datos: { materias, progreso } }, el intermedio
  // { estado: { materias, progreso } } y el viejo { datos: { materias } }.
  // "progreso" queda en null si el remoto no lo trae (version antigua), para
  // no borrar el progreso local en ese caso.
  function estadoDe(remoto) {
    if (!remoto) return null;
    var e = remoto.datos || remoto.estado || null;
    if (!e || typeof e !== 'object') return null;
    return {
      materias: Array.isArray(e.materias) ? e.materias : [],
      progreso: (e.progreso && typeof e.progreso === 'object') ? e.progreso : null
    };
  }

  function tieneContenido(estado) {
    return !!(estado && (estado.materias.length > 0 ||
      (estado.progreso && Object.keys(estado.progreso).length > 0)));
  }

  // POST es el metodo normal de MantleDB. Si la red, un antivirus o una
  // extension lo bloquea (sin respuesta o con error HTTP), se reintenta con
  // PATCH, que tambien sobrescribe.
  function enviar(cuerpo, cuerpoPatch) {
    var cab = { 'Content-Type': 'application/json' };
    function intento(metodo, datos) {
      return fetch(SYNC_URL, { method: metodo, headers: cab, body: datos }).then(function (r) {
        if (!r.ok) throw new Error(metodo + ' HTTP ' + r.status);
        return r;
      });
    }
    return intento('POST', cuerpo).catch(function (e1) {
      // MantleDB fusiona el PATCH con lo que ya hubiera. Se envia tambien
      // "estado" (mismo contenido) para que ningun cliente lea datos viejos.
      return intento('PATCH', cuerpoPatch || cuerpo).catch(function (e2) {
        throw new Error(e1.message + ' / ' + e2.message);
      });
    });
  }

  function programarPush(inmediato) {
    cambiosPendientes = true;
    clearTimeout(pushTimer);
    setSyncStatus('\u21c5 Subiendo\u2026');
    pushTimer = setTimeout(subirEstado, inmediato ? 200 : SYNC_DELAY_MS);
  }

  function subirEstado() {
    if (!onlineOk()) { setSyncStatus('\u26a0 Sin conexi\u00f3n', 'navigator.onLine = false'); return Promise.resolve(); }
    var guardadoEn = Date.now();
    var est = estadoLocal();
    var estado = { version: 2, materias: est.materias, progreso: est.progreso };
    var cuerpo = JSON.stringify({ guardadoEn: guardadoEn, datos: estado });
    var cuerpoPatch = JSON.stringify({ guardadoEn: guardadoEn, datos: estado, estado: estado });
    return enviar(cuerpo, cuerpoPatch).then(function () {
      syncTs = guardadoEn;
      reintentos = 0;
      cambiosPendientes = false;
      guardarTs(syncTs);
      setSyncStatus('\u2713 Sincronizado');
    }).catch(function (e) {
      reintentos++;
      setSyncStatus('\u26a0 Sin conexi\u00f3n', e && e.message ? e.message : '');
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
      // Si el remoto no trae progreso (version antigua), conserva el local.
      var prog = estado.progreso === null ? progresoLocal() : estado.progreso;
      if (prog && Object.keys(prog).length > 0) {
        localStorage.setItem(CLAVE_PROG, JSON.stringify(prog));
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

      // Si este dispositivo esta vacio, siempre adopta lo que haya en la nube,
      // aunque su timestamp local sea mayor (evita borrar la nube por error).
      if (estado && estado.materias.length > 0 && (tsRemoto > syncTs || !localConDatos)) {
        adoptar(estado, tsRemoto);
        setSyncStatus('\u2713 Sincronizado');
      } else if (cambiosPendientes || tsRemoto < syncTs ||
                 (localConDatos && (!estado || estado.materias.length === 0))) {
        programarPush(true);
      } else {
        setSyncStatus('\u2713 Sincronizado');
      }
    }).catch(function (e) {
      setSyncStatus('', e && e.message ? e.message : '');
      // Aunque falle la lectura, si hay datos locales conviene intentar subirlos.
      if (tieneContenido(estadoLocal())) programarPush(true);
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
    addEventListener('online', function () { iniciarSincronizacion(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) iniciarSincronizacion();
    });
    addEventListener('beforeunload', function () {
      if (!cambiosPendientes) return;
      try {
        var est = estadoLocal();
        fetch(SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guardadoEn: Date.now(),
            datos: { version: 2, materias: est.materias, progreso: est.progreso }
          }),
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
