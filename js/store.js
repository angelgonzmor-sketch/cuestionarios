window.Store = (function () {
  'use strict';

  const CLAVE = 'cuestionarios.v2';
  const CLAVE_VIEJA = 'cuestionarios.v1';

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function vacio() {
    return { version: 2, materias: [] };
  }

  // ---------- limpieza de datos ----------

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
      // Un cuestionario que se queda sin preguntas no se puede resolver:
      // se descarta al importar.
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
      // Una pregunta sin opciones, o sin ninguna correcta, no se puede
      // presentar: se descarta al importar.
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

  // Acepta el formato nuevo (materia > subcarpeta > cuestionario) y tambien
  // el formato viejo (materia > cuestionario), al que le anade una subcarpeta
  // "General" para no perder lo que ya existia.
  function normalizar(datos) {
    if (!datos || !Array.isArray(datos.materias)) return null;

    const materias = datos.materias
      .filter(function (m) { return m && typeof m.nombre === 'string' && m.nombre.trim() !== ''; })
      .map(function (m) {
        const subcarpetas = Array.isArray(m.subcarpetas)
          ? limpiarSubcarpetas(m.subcarpetas)
          : [];

        // Migracion desde el formato v1.
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

    return { version: 2, materias: materias };
  }

  // ---------- persistencia ----------

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

    // Intenta rescatar los datos del formato anterior.
    try {
      const viejo = localStorage.getItem(CLAVE_VIEJA);
      if (viejo) {
        const datos = normalizar(JSON.parse(viejo));
        if (datos && datos.materias.length) {
          guardar(datos);
          return datos;
        }
      }
    } catch (e) {
      console.warn('No se pudieron migrar los datos anteriores:', e);
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
    let sub = 0;
    let cues = 0;
    let preguntas = 0;
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
    id: id
  };
})();