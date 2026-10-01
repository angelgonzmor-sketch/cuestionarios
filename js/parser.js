window.Parser = (function () {
  'use strict';

  const RE_NUM_PREGUNTA = /^\s*(\d+)\s*[\)\.\-]\s*(.*)$/;
  const RE_OPCION = /^\s*(?:\s*\*\s*)?(?:[-–]\s*)?(?:([ivxlcdm]{2,4}|[a-zA-Z])\s*\*?\s*[\)\.\-]\s*)?(?:\s*\*\s*)?(.*)$/i;
  const RE_CORRECTA = /^\s*[\[\(]?\s*(?:correcta|correcto|respuesta|ans|r)\s*[:\-]?\s*([a-zA-Z]+|\d+)\s*[\]\)]?\s*$/i;
  const RE_ROMANA = /^([ivxlcdm]+)$/i;
  const ROMANOS = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

  function romanoANum(s) {
    let total = 0;
    for (let i = 0; i < s.length; i++) {
      const v = ROMANOS[s[i].toLowerCase()];
      if (v === undefined) return null;
      total += v < ROMANOS[(s[i + 1] || 'i').toLowerCase()] ? -v : v;
    }
    return total;
  }

  function normClave(c) {
    if (!c) return '';
    const r = RE_ROMANA.test(c) ? romanoANum(c) : null;
    return String(r !== null ? r : c).toLowerCase();
  }

  function detectTipo(texto) {
    const t = String(texto || '');
    let conAsterisco = false;
    let conMarca = false;
    t.split(/\r?\n/).forEach(function (linea) {
      if (/^\s*\*/.test(linea)) conAsterisco = true;
      if (RE_CORRECTA.test(linea)) conMarca = true;
    });
    return conAsterisco ? 'asterisco' : conMarca ? 'marca' : 'ambos';
  }

  function parse(texto) {
    const lineas = String(texto || '').split(/\r?\n/);
    const preguntas = [];
    const errores = [];
    let actual = null;
    let pendientes = [];

    function cerrar() {
      if (!actual) return;
      if (actual.opciones.length === 0) {
        errores.push({ linea: actual.linea, msg: 'La pregunta no tiene opciones.' });
      } else {
        const idx = actual.opciones.findIndex(function (o) { return o.correcta; });
        if (idx === -1) {
          errores.push({
            linea: actual.linea,
            msg: 'Ninguna opción está marcada como correcta: "' + actual.texto + '"'
          });
        } else {
          const correctas = actual.opciones.filter(function (o) { return o.correcta; }).length;
          if (correctas > 1) {
            errores.push({
              linea: actual.linea,
              msg: 'Varias opciones marcadas como correctas: "' + actual.texto + '"'
            });
          } else {
            preguntas.push({
              texto: actual.texto,
              opciones: actual.opciones
            });
          }
        }
      }
      actual = null;
      pendientes = [];
    }

    for (let i = 0; i < lineas.length; i++) {
      const n = i + 1;
      const cruda = lineas[i];
      const linea = cruda.trim();
      if (linea === '') {
        // Una linea en blanco separa preguntas, pero no rompe el bloque
        // pregunta -> opciones (puede haberla justo despues del enunciado).
        if (actual && actual.opciones.length > 0) cerrar();
        continue;
      }

      const mCorrecta = cruda.match(RE_CORRECTA);
      if (mCorrecta && actual) {
        const ref = mCorrecta[1];
        const clave = normClave(ref);
        let idx = actual.opciones.findIndex(function (o) { return o.clave === clave; });
        // Si las opciones no llevan letra, "[correcta: 2]" significa la segunda opcion.
        if (idx === -1 && /^\d+$/.test(ref)) {
          const pos = parseInt(ref, 10) - 1;
          if (pos >= 0 && pos < actual.opciones.length) idx = pos;
        }
        if (idx === -1) {
          errores.push({ linea: n, msg: 'La opción "' + mCorrecta[1] + '" no existe en la pregunta anterior.' });
        } else {
          actual.opciones[idx].correcta = true;
          pendientes = pendientes.filter(function (p) { return p.opc !== actual.opciones[idx]; });
          if (pendientes.length) errores.push({ linea: n, msg: 'Se ignoró "*" de la línea ' + pendientes[0].linea + '.' });
          pendientes = [];
        }
        continue;
      }

      const mPregunta = linea.match(RE_NUM_PREGUNTA);
      if (mPregunta) {
        cerrar();
        actual = { texto: mPregunta[2].replace(/^\*\s*/, '').trim(), opciones: [], linea: n };
        continue;
      }

      const mOpcion = cruda.match(RE_OPCION);

      if (!actual) {
        actual = { texto: linea.replace(/^\*\s*/, '').trim(), opciones: [], linea: n };
        continue;
      }

      const asterisco = mOpcion !== null && mOpcion[0].indexOf('*') !== -1;
      const clave = mOpcion && mOpcion[1] ? normClave(mOpcion[1]) : '';
      const texto = mOpcion ? (mOpcion[2] || '').trim() : linea;

      if (texto === '') {
        if (asterisco) {
          const idx = actual.opciones.length - 1;
          if (idx >= 0) {
            actual.opciones[idx].correcta = true;
          } else {
            errores.push({ linea: n, msg: '"*" sin opción a la que aplicarse.' });
          }
        }
        continue;
      }

      const opc = { texto: texto, clave: clave, correcta: asterisco };
      actual.opciones.push(opc);
      if (asterisco) pendientes.push({ linea: n, opc: opc });
    }
    cerrar();

    preguntas.forEach(function (p, i) { p.id = 'p' + (i + 1); });
    return { preguntas: preguntas, errores: errores };
  }

  return { parse: parse, detectTipo: detectTipo };
})();