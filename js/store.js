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
    return { version: 2, materias: materias, tema: tema, borrador: datos.borrador || null };
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
    limpiarTodosProgresos: limpiarTodosProgresos
  };
})();
