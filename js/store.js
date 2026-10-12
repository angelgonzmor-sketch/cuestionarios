window.Store = (function () {
  'use strict';

  const CLAVE = 'cuestionarios.v2';

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function vacio() {
    return { version: 2, materias: [], tema: 'oscuro', borrador: null };
  }

  const CLAVE_PROG = 'cuestionarios.progreso.v1';

  function cargarProgresos() {
    try {
      const crudo = localStorage.getItem(CLAVE_PROG);
      return crudo ? JSON.parse(crudo) : {};
    } catch (e) {
      return {};
    }
  }

  function guardarProgresos(mapa) {
    try {
      localStorage.setItem(CLAVE_PROG, JSON.stringify(mapa));
      return true;
    } catch (e) {
      return false;
    }
  }

  function claveProg(materiaId, unidadId, cuestionarioId) {
    return materiaId + '|' + unidadId + '|' + cuestionarioId;
  }

  function guardarProgreso(materiaId, unidadId, cuestionarioId, datos) {
    const mapa = cargarProgresos();
    mapa[claveProg(materiaId, unidadId, cuestionarioId)] = datos;
    guardarProgresos(mapa);
  }

  function cargarProgreso(materiaId, unidadId, cuestionarioId) {
    const mapa = cargarProgresos();
    return mapa[claveProg(materiaId, unidadId, cuestionarioId)] || null;
  }

  function limpiarProgreso(materiaId, unidadId, cuestionarioId) {
    const mapa = cargarProgresos();
    delete mapa[claveProg(materiaId, unidadId, cuestionarioId)];
    guardarProgresos(mapa);
  }

  function limpiarTodosProgresos() {
    try { localStorage.removeItem(CLAVE_PROG); } catch (e) {}
  }

  // ---------- sincronización entre dispositivos ----------
  // Imita el guardado de una cuenta de Google: los cuestionarios y el progreso
  // de cada sesión viajan dentro del mismo JSON de Exportar/Importar, de modo
  // que se pueden mover entre dispositivos o navegadores.
  const CLAVE_NUBE = 'cuestionarios.nube.v1';

  function guardarNube(contenido) {
    try {
      localStorage.setItem(CLAVE_NUBE, contenido);
      return true;
    } catch (e) {
      return false;
    }
  }

  function cargarNube() {
    try {
      return localStorage.getItem(CLAVE_NUBE);
    } catch (e) {
      return null;
    }
  }

  function exportarContenido(conProgresos) {
    const copia = JSON.parse(JSON.stringify(datos_ || {}));
    if (conProgresos) copia.progresos = cargarProgresos();
    delete copia.borrador;
    return JSON.stringify(copia, null, 2);
  }

  function importarContenido(texto, conProgresos) {
    let json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      return { ok: false, error: 'El contenido no es un JSON válido.' };
    }
    const limpio = normalizar(json);
    if (!limpio) return { ok: false, error: 'El contenido no tiene la estructura de cuestionarios.' };
    datos_ = limpio;
    guardar(limpio);
    if (conProgresos && json && json.progresos && typeof json.progresos === 'object') {
      guardarProgresos(json.progresos);
    } else {
      limpiarTodosProgresos();
    }
    return { ok: true, datos: limpio };
  }

  let datos_ = null;
  function setDatos(d) { datos_ = d; }

  function limpiarCuestionarios(lista) {
    return (Array.isArray(lista) ? lista : [])
      .filter(function (q) { return q && typeof q.titulo === 'string' && q.titulo.trim() !== ''; })
      .map(function (q) {
        return {
          id: q.id || id(),
          titulo: q.titulo,
          preguntas: limpiarPreguntas(q.preguntas)
        };
      })
      .filter(function (q) { return q.preguntas.length > 0; });
  }

  function limpiarPreguntas(lista) {
    return (Array.isArray(lista) ? lista : [])
      .filter(function (p) { return p && typeof p.texto === 'string'; })
      .map(function (p) {
        const opciones = (Array.isArray(p.opciones) ? p.opciones : [])
          .filter(function (o) { return o && typeof o.texto === 'string'; })
          .map(function (o) { return { texto: o.texto, correcta: Boolean(o.correcta) }; });
        return { id: p.id || id(), texto: p.texto, opciones: opciones };
      })
      .filter(function (p) {
        return p.opciones.length > 0 && p.opciones.some(function (o) { return o.correcta; });
      });
  }

  function limpiarSubcarpetas(lista) {
    return (Array.isArray(lista) ? lista : [])
      .filter(function (s) { return s && typeof s.nombre === 'string' && s.nombre.trim() !== ''; })
      .map(function (s) {
        return {
          id: s.id || id(),
          nombre: s.nombre,
          cuestionarios: limpiarCuestionarios(s.cuestionarios)
        };
      });
  }

  function normalizar(datos) {
    if (!datos || !Array.isArray(datos.materias)) return null;

    const materias = datos.materias
      .filter(function (m) { return m && typeof m.nombre === 'string' && m.nombre.trim() !== ''; })
      .map(function (m) {
        const subcarpetas = Array.isArray(m.subcarpetas)
          ? limpiarSubcarpetas(m.subcarpetas)
          : [];
        const sueltos = limpiarCuestionarios(m.cuestionarios);
        if (sueltos.length) {
          subcarpetas.unshift({ id: id(), nombre: 'General', cuestionarios: sueltos });
        }
        return {
          id: m.id || id(),
          nombre: m.nombre,
          subcarpetas: subcarpetas
        };
      });

    const tema = (datos.tema === 'claro' || datos.tema === 'oscuro') ? datos.tema : 'oscuro';
    const progresos = (datos.progresos && typeof datos.progresos === 'object' && !Array.isArray(datos.progresos))
      ? datos.progresos : undefined;
    const salida = { version: 2, materias: materias, tema: tema, borrador: datos.borrador || null };
    if (progresos) salida.progresos = progresos;
    return salida;
  }

  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (crudo) {
        const datos = normalizar(JSON.parse(crudo));
        if (datos) return datos;
      }
    } catch (e) {
      console.warn('No se pudieron leer los datos guardados:', e);
    }
    return vacio();
  }

  function guardar(datos) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(datos));
      return true;
    } catch (e) {
      console.error('Error al guardar:', e);
      return false;
    }
  }

  function contar(datos) {
    let sub = 0; let cues = 0; let preguntas = 0;
    datos.materias.forEach(function (m) {
      sub += m.subcarpetas.length;
      m.subcarpetas.forEach(function (s) {
        cues += s.cuestionarios.length;
        s.cuestionarios.forEach(function (q) { preguntas += q.preguntas.length; });
      });
    });
    return { materias: datos.materias.length, subcarpetas: sub, cuestionarios: cues, preguntas: preguntas };
  }

  return {
    CLAVE: CLAVE,
    cargar: cargar,
    guardar: guardar,
    vacio: vacio,
    normalizar: normalizar,
    contar: contar,
    id: id,
    guardarProgreso: guardarProgreso,
    cargarProgreso: cargarProgreso,
    limpiarProgreso: limpiarProgreso,
    limpiarTodosProgresos: limpiarTodosProgresos,
    setDatos: setDatos,
    guardarProgresos: guardarProgresos,
    cargarProgresos: cargarProgresos,
    guardarNube: guardarNube,
    cargarNube: cargarNube,
    exportarContenido: exportarContenido,
    importarContenido: importarContenido
  };
})();
