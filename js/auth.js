// ---------- Inicio de sesión y sincronización en la nube ----------
// Al iniciar sesión, los cuestionarios y el progreso se guardan asociados a la
// cuenta (como el guardado de Google): en cualquier dispositivo, al iniciar
// sesión con la misma cuenta, los datos aparecen actualizados.
//
// Funciona de dos formas:
//  1. Con servidor de sincronización (recomendado para distintos dispositivos):
//     si hay una URL emparejada o se configura desde "Ajustes de sincronización",
//     los datos viajan por HTTPS a js/servidor-sync.js (Node sin dependencias).
//  2. Sin servidor: cada cuenta tiene su propia caja fuerte local; dos ventanas
//     del mismo navegador se sincronizan automáticamente entre sí.
window.Auth = (function () {
  'use strict';

  const CUENTAS_KEY = 'cuentas.v1';
  const SESION_KEY = 'sesion.actual.v1';
  const EMPAREJA_KEY = 'sync.emparejado.v1';
  const AJUSTE_KEY = 'sync.servidor.v1';
  const PBKDF2 = 100000;

  let sesionActual = null; // { correo, nombre }
  let enServidor = false;  // true si este navegador detectó el servidor de sync
  let ultimaSyncTs = 0;
  let tsPropio = 0;        // marca de tiempo de la última escritura LOCAL
  let suscriptores = [];
  let sondeoId = null;

  function hashHex(texto, sal) {
    if (!(window.crypto && window.crypto.subtle)) {
      return Promise.resolve('sinseguro:' + texto);
    }
    const enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(texto), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(sal), iterations: PBKDF2, hash: 'SHA-256' },
          k, 256);
      })
      .then(function (bits) {
        return Array.from(new Uint8Array(bits)).map(function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      });
  }

  function normalizarCorreo(c) { return String(c || '').trim().toLowerCase(); }

  function leerCuentas() {
    try {
      const crudo = localStorage.getItem(CUENTAS_KEY);
      const lista = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function escribirCuentas(lista) {
    localStorage.setItem(CUENTAS_KEY, JSON.stringify(lista));
  }

  function claveDatos(correo) { return 'cuenta.datos.' + correo; }
  function claveMeta(correo) { return 'cuenta.meta.' + correo; }

  function leerMetaLocal(correo) {
    try {
      const m = localStorage.getItem(claveMeta(correo));
      return m ? JSON.parse(m) : null;
    } catch (e) { return null; }
  }

  function escribirMetaLocal(correo, meta) {
    try { localStorage.setItem(claveMeta(correo), JSON.stringify(meta)); } catch (e) {}
  }

  // ---------- servidor de sincronización ----------
  function urlBaseServidor() {
    const emp = localStorage.getItem(EMPAREJA_KEY);
    if (emp) return emp.replace(/\/+$/, '');
    const aj = localStorage.getItem(AJUSTE_KEY);
    if (aj) return aj.replace(/\/+$/, '');
    return '';
  }

  function api(path, opciones) {
    const base = urlBaseServidor();
    if (!base) return Promise.resolve(null);
    return fetch(base + path, opciones)
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function pingServidor() {
    const base = urlBaseServidor();
    if (!base) return Promise.resolve(false);
    return fetch(base + '/apiping', { cache: 'no-store' })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  // ---------- registro / acceso ----------
  function registrar(nombre, correo, password) {
    nombre = String(nombre || '').trim();
    correo = normalizarCorreo(correo);
    if (!nombre) return Promise.reject(new Error('Escribe tu nombre.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return Promise.reject(new Error('El correo no parece válido.'));
    if (!password || password.length < 6) return Promise.reject(new Error('La contraseña debe tener al menos 6 caracteres.'));
    const cuentas = leerCuentas();
    if (cuentas.some(function (c) { return c.correo === correo; })) {
      return Promise.reject(new Error('Ya existe una cuenta con ese correo. Inicia sesión.'));
    }
    const sal = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return hashHex(password, sal).then(function (hash) {
      cuentas.push({ nombre: nombre, correo: correo, sal: sal, hash: hash, creado: Date.now() });
      escribirCuentas(cuentas);
      return { nombre: nombre, correo: correo };
    });
  }

  function verificarPassword(cuenta, password) {
    if (String(cuenta.hash || '').indexOf('sinseguro:') === 0) {
      return Promise.resolve(cuenta.hash === 'sinseguro:' + password);
    }
    return hashHex(password, cuenta.sal).then(function (h) { return h === cuenta.hash; });
  }

  function iniciar(correo, password) {
    correo = normalizarCorreo(correo);
    const cuenta = leerCuentas().find(function (c) { return c.correo === correo; });
    if (!cuenta) return Promise.reject(new Error('No existe una cuenta con ese correo. Regístrate primero.'));
    return verificarPassword(cuenta, password).then(function (ok) {
      if (!ok) throw new Error('Contraseña incorrecta.');
      return abrirSesion({ nombre: cuenta.nombre, correo: cuenta.correo }, password).then(function () {
        return { nombre: cuenta.nombre, correo: cuenta.correo };
      });
    });
  }

  function sesionGuardada() {
    try {
      const s = localStorage.getItem(SESION_KEY);
      const obj = s ? JSON.parse(s) : null;
      // Con servidor de sincronización basta recordar el correo: la nube es
      // la fuente de los datos, así que el dispositivo entra directo.
      if (obj && obj.correo && (obj.password || urlBaseServidor())) return obj;
    } catch (e) {}
    return null;
  }

  function iniciarConSesionGuardada() {
    const s = sesionGuardada();
    if (!s) return Promise.resolve(null);
    if (!s.password && urlBaseServidor()) {
      // Entrar sin contraseña usando el "pase" guardado en este navegador.
      const cuenta = leerCuentas().find(function (c) { return c.correo === s.correo; });
      const usuario = { nombre: cuenta ? cuenta.nombre : s.correo.split('@')[0], correo: s.correo };
      return abrirSesion(usuario, '').then(function () { return usuario; })
        .catch(function () { return null; });
    }
    return iniciar(s.correo, s.password).then(function (u) {
      return u;
    }).catch(function () {
      cerrarSesionLocal();
      return null;
    });
  }

  function cerrarSesionLocal() {
    sesionActual = null;
    localStorage.removeItem(SESION_KEY);
    if (sondeoId) { clearInterval(sondeoId); sondeoId = null; }
  }

  function cerrarSesion() {
    cerrarSesionLocal();
    notificar({ tipo: 'cerrar' });
  }

  // ---------- datos por cuenta ----------
  function guardarDatosLocales(contenido) {
    if (!sesionActual) return false;
    const correo = sesionActual.correo;
    tsPropio = Date.now();
    try {
      localStorage.setItem(claveDatos(correo), contenido);
      escribirMetaLocal(correo, { ts: tsPropio });
      return true;
    } catch (e) { return false; }
  }

  function cargarDatosLocales(correo) {
    try { return localStorage.getItem(claveDatos(correo)); } catch (e) { return null; }
  }

  function subirAlServidor(contenido) {
    if (!sesionActual || !urlBaseServidor()) return Promise.resolve(false);
    return api('/api/datos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ correo: sesionActual.correo, password: sesionActual.password, contenido: contenido })
    }).then(function (r) { return Boolean(r && r.ok); })
      .catch(function () { return false; });
  }

  function bajarDelServidor() {
    if (!sesionActual || !urlBaseServidor()) return Promise.resolve(null);
    return api('/api/datos?correo=' + encodeURIComponent(sesionActual.correo), { cache: 'no-store' })
      .then(function (r) { return (r && r.ok && r.datos) ? r.datos : null; })
      .catch(function () { return null; });
  }

  function abrirSesion(usuario, password) {
    sesionActual = { correo: usuario.correo, nombre: usuario.nombre, password: password || '' };
    try {
      localStorage.setItem(SESION_KEY, JSON.stringify({ correo: usuario.correo, password: sesionActual.password }));
    } catch (e) {}
    return pingServidor().then(function (ok) {
      enServidor = ok;
      if (sondeoId) clearInterval(sondeoId);
      sondeoId = setInterval(chequearRemoto, 4000);
    });
  }

  // Carga los datos de la cuenta: prefiere el servidor si está disponible y es
  // más reciente que la copia local (lo que haya en otro dispositivo).
  function cargarDatosDeCuenta() {
    if (!sesionActual) return Promise.resolve(null);
    const local = cargarDatosLocales(sesionActual.correo);
    const meta = leerMetaLocal(sesionActual.correo);
    const tsLocal = meta && meta.ts ? meta.ts : 0;
    ultimaSyncTs = tsLocal;
    return bajarDelServidor().then(function (remoto) {
      if (remoto && remoto.contenido) {
        const tsRem = Number(remoto.ts) || 0;
        if (!local || tsRem >= tsLocal) {
          try {
            localStorage.setItem(claveDatos(sesionActual.correo), remoto.contenido);
            escribirMetaLocal(sesionActual.correo, { ts: tsRem || Date.now() });
            tsPropio = tsRem || Date.now();
            ultimaSyncTs = tsPropio;
          } catch (e) {}
          return remoto.contenido;
        }
        // La copia local es más nueva: se sube al servidor.
        return subirAlServidor(local).then(function () { return local; });
      }
      return local;
    });
  }

  // Guarda los datos de la sesión (local + servidor si existe).
  function persistir(contenido) {
    const okLocal = guardarDatosLocales(contenido);
    if (enServidor || urlBaseServidor()) {
      return subirAlServidor(contenido).then(function (okRem) {
        ultimaSyncTs = Date.now();
        return { ok: okLocal || okRem, servidor: okRem };
      });
    }
    ultimaSyncTs = Date.now();
    return Promise.resolve({ ok: okLocal, servidor: false });
  }

  // Sondeo: si otro dispositivo/ventana subió datos más nuevos, avisa.
  function chequearRemoto() {
    if (!sesionActual) return;
    const correo = sesionActual.correo;
    if (enServidor) {
      bajarDelServidor().then(function (remoto) {
        if (!remoto || !remoto.contenido) return;
        const tsRem = Number(remoto.ts) || 0;
        if (tsRem > ultimaSyncTs && tsRem > tsPropio) {
          try {
            localStorage.setItem(claveDatos(correo), remoto.contenido);
            escribirMetaLocal(correo, { ts: tsRem });
          } catch (e) { return; }
          notificar({ tipo: 'nube', contenido: remoto.contenido, ts: tsRem });
        }
      });
    } else {
      const meta = leerMetaLocal(correo);
      const ts = meta && meta.ts ? meta.ts : 0;
      if (ts > ultimaSyncTs && ts !== tsPropio) {
        ultimaSyncTs = ts;
        notificar({ tipo: 'local', contenido: cargarDatosLocales(correo), ts: ts });
      }
    }
  }

  // ---------- suscripción (otros cambios en la misma cuenta) ----------
  function suscribir(fn) {
    suscriptores.push(fn);
    return function () {
      suscriptores = suscriptores.filter(function (f) { return f !== fn; });
    };
  }

  function notificar(evento) {
    if (!sesionActual) return;
    suscriptores.slice().forEach(function (fn) {
      try { fn(evento); } catch (e) {}
    });
  }

  // Otra ventana del MISMO navegador (misma cuenta) escribió datos: refrescar.
  window.addEventListener('storage', function (ev) {
    if (!sesionActual || !ev.key || !ev.newValue) return;
    if (ev.key === claveDatos(sesionActual.correo)) {
      const meta = leerMetaLocal(sesionActual.correo);
      const ts = meta && meta.ts ? meta.ts : Date.now();
      if (ts !== tsPropio) {
        ultimaSyncTs = ts;
        notificar({ tipo: 'local', contenido: ev.newValue, ts: ts });
      }
    }
  });

  function estado() {
    return {
      usuario: sesionActual ? { nombre: sesionActual.nombre, correo: sesionActual.correo } : null,
      servidor: enServidor ? urlBaseServidor() : '',
      ultimaSync: ultimaSyncTs
    };
  }

  function servidorConfigurado() { return Boolean(urlBaseServidor()); }

  function configurarServidor(url) {
    url = String(url || '').trim();
    if (url) {
      if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error('La dirección debe empezar por http:// o https://'));
      localStorage.setItem(AJUSTE_KEY, url);
    } else {
      localStorage.removeItem(AJUSTE_KEY);
    }
    return pingServidor().then(function (ok) {
      if (url && !ok) throw new Error('No se pudo conectar con ese servidor. Verifica la dirección y que el servidor esté encendido.');
      enServidor = ok;
      return ok;
    });
  }

  return {
    registrar: registrar,
    iniciar: iniciar,
    cerrarSesion: cerrarSesion,
    sesionGuardada: sesionGuardada,
    iniciarConSesionGuardada: iniciarConSesionGuardada,
    persistir: persistir,
    cargarDatosDeCuenta: cargarDatosDeCuenta,
    estado: estado,
    suscribir: suscribir,
    configurarServidor: configurarServidor,
    servidorConfigurado: servidorConfigurado,
    pingServidor: pingServidor
  };
})();
