(function () {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.from(document.querySelectorAll(sel)); };

  let datos = Store.cargar();
  let materiaActual = null;
  let unidadActual = null;
  let cuestionarioActual = null;
  let editando = null;
  let sesion = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Los textos que van a textContent o a confirm() se escriben con acentos
  // reales: las entidades HTML solo funcionan dentro de innerHTML.
  let timerAviso = null;
  function aviso(msg, esError) {
    const el = $('#aviso');
    el.textContent = msg;
    el.classList.remove('oculto');
    el.classList.toggle('error', Boolean(esError));
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { el.classList.add('oculto'); }, esError ? 6000 : 2500);
  }

  function persistir() {
    if (!Store.guardar(datos)) aviso('No se pudo guardar en este navegador.', true);
  }

  function ver(nombre) {
    $$('.vista').forEach(function (v) { v.classList.add('oculto'); });
    $('#vista-' + nombre).classList.remove('oculto');
    window.scrollTo(0, 0);
  }

  // ----------	localizadores ----------
  function materiaPorId(mid) {
    return datos.materias.find(function (m) { return m.id === mid; }) || null;
  }

  function unidadPorId(mid, uid) {
    const m = materiaPorId(mid);
    return m ? (m.subcarpetas.find(function (u) { return u.id === uid; }) || null) : null;
  }

  function cuestionarioPorId(mid, uid, qid) {
    const u = unidadPorId(mid, uid);
    return u ? (u.cuestionarios.find(function (q) { return q.id === qid; }) || null) : null;
  }

  function plural(n, singular, pluralForma) {
    return n + ' ' + (n === 1 ? singular : (pluralForma || singular + 's'));
  }

  // ---------- migas de pan ----------
  function pintarMigas(nivel, etiquetaMateria, etiquetaUnidad) {
    const m = $('#migas');
    m.innerHTML = '';
    const partes = [{ txt: 'Materias', accion: 'materias' }];
    if (nivel !== 'materias' && etiquetaMateria) partes.push({ txt: etiquetaMateria, accion: 'unidades' });
    if (nivel === 'cuestionarios' && etiquetaUnidad) partes.push({ txt: etiquetaUnidad, accion: null });

    partes.forEach(function (p, i) {
      const s = document.createElement('span');
      s.className = 'miga' + (i === partes.length - 1 ? ' actual' : '');
      if (p.accion) {
        const b = document.createElement('button');
        b.className = 'miga-btn';
        b.textContent = p.txt;
        b.addEventListener('click', function () {
          if (p.accion === 'materias') { materiaActual = null; unidadActual = null; pintarMaterias(); ver('materias'); }
          else { unidadActual = null; pintarUnidades(); }
        });
        s.appendChild(b);
      } else {
        s.textContent = p.txt;
      }
      if (i < partes.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'miga-sep';
        sep.textContent = '›';
        m.appendChild(sep);
      }
      m.appendChild(s);
    });
  }

  // ---------- MATERIAS ----------
  function pintarMaterias() {
    const cont = $('#listaMaterias');
    cont.innerHTML = '';
    pintarMigas('materias');
    if (datos.materias.length === 0) {
      cont.innerHTML = '<p class="meta">Aún no hay materias. Crea la primera arriba.</p>';
      return;
    }

    datos.materias.forEach(function (m) {
      const unidades = m.subcarpetas.length;
      const totalQ = m.subcarpetas.reduce(function (a, u) { return a + u.cuestionarios.length; }, 0);
      const totalP = m.subcarpetas.reduce(function (a, u) {
        return a + u.cuestionarios.reduce(function (b, q) { return b + q.preguntas.length; }, 0);
      }, 0);

      const div = document.createElement('div');
      div.className = 'tarjeta-materia';
      div.innerHTML =
        '<div class="cab"><h3>' + esc(m.nombre) + '</h3>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="abrir">Abrir</button>' +
        '<button class="sec" data-acc="renombrar">Renombrar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div></div>' +
        '<p class="meta">' + (unidades
          ? plural(unidades, 'subcarpeta') +
            (totalQ ? ' &middot; ' + plural(totalQ, 'cuestionario') : '') +
            (totalP ? ' &middot; ' + plural(totalP, 'pregunta') : '')
          : 'Sin subcarpetas') +
        '</p>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'abrir') {
          materiaActual = m.id;
          unidadActual = null;
          cuestionarioActual = null;
          pintarUnidades();
        } else if (b.dataset.acc === 'renombrar') {
          const nombre = prompt('Nuevo nombre de la materia:', m.nombre);
          if (nombre === null) return;
          const limpio = nombre.trim();
          if (!limpio) return aviso('El nombre no puede quedar vacío.', true);
          if (nombreDuplicado(datos.materias.map(function (x) { return x.nombre; }), limpio, m.id))
            return aviso('Ya existe una materia con ese nombre.', true);
          m.nombre = limpio;
          persistir();
          pintarMaterias();
        } else {
          const extra = unidades ? ' con sus ' + plural(unidades, 'subcarpeta') + ' y ' + plural(totalQ, 'cuestionario') : '';
          if (!confirm('¿Eliminar la materia "' + m.nombre + '"' + extra + '? No se puede deshacer.')) return;
          datos.materias = datos.materias.filter(function (x) { return x.id !== m.id; });
          persistir();
          pintarMaterias();
        }
      });
      cont.appendChild(div);
    });
  }

  function nombreDuplicado(lista, nombre, ignorarId) {
    const n = nombre.toLowerCase();
    return lista.some(function (x) { return x.id !== ignorarId && x.toLowerCase() === n; });
  }

  function crearMateria() {
    const input = $('#inputMateria');
    const nombre = input.value.trim();
    if (!nombre) return aviso('Escribe el nombre de la materia.', true);
    if (nombreDuplicado(datos.materias.map(function (x) { return x.nombre; }), nombre, null))
      return aviso('Ya existe una materia con ese nombre.', true);
    datos.materias.push({ id: Store.id(), nombre: nombre, subcarpetas: [] });
    input.value = '';
    persistir();
    pintarMaterias();
  }

  // ---------- SUBCARPETAS / UNIDADES ----------
  function siguienteNumeroUnidad(m) {
    let max = 0;
    m.subcarpetas.forEach(function (u) {
      const n = u.nombre.match(/^unidad\s+(\d+)$/i);
      if (n) max = Math.max(max, parseInt(n[1], 10));
    });
    return max + 1;
  }

  function pintarUnidades() {
    const m = materiaPorId(materiaActual);
    if (!m) { materiaActual = null; return pintarMaterias(); }

    $('#tituloMateria').textContent = m.nombre;
    $('#inputUnidad').value = '';
    pintarMigas('unidades', m.nombre);

    // Cambia de vista antes de la salida temprana del caso sin subcarpetas.
    ver('unidades');

    const cont = $('#listaUnidades');
    cont.innerHTML = '';
    if (m.subcarpetas.length === 0) {
      cont.innerHTML = '<p class="meta">Esta materia no tiene subcarpetas. Crea la Unidad 1, o la que necesites.</p>';
      return;
    }

    m.subcarpetas.forEach(function (u) {
      const totalP = u.cuestionarios.reduce(function (a, q) { return a + q.preguntas.length; }, 0);
      const div = document.createElement('div');
      div.className = 'tarjeta-materia';
      div.innerHTML =
        '<div class="cab"><h3>' + esc(u.nombre) + '</h3>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="abrir">Abrir</button>' +
        '<button class="sec" data-acc="renombrar">Renombrar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div></div>' +
        '<p class="meta">' + (u.cuestionarios.length
          ? plural(u.cuestionarios.length, 'cuestionario') + ' &middot; ' + plural(totalP, 'pregunta')
          : 'Sin cuestionarios') +
        '</p>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'abrir') {
          unidadActual = u.id;
          cuestionarioActual = null;
          pintarCuestionarios();
        } else if (b.dataset.acc === 'renombrar') {
          const nombre = prompt('Nuevo nombre de la subcarpeta:', u.nombre);
          if (nombre === null) return;
          const limpio = nombre.trim();
          if (!limpio) return aviso('El nombre no puede quedar vacío.', true);
          if (nombreDuplicado(m.subcarpetas.map(function (x) { return x.nombre; }), limpio, u.id))
            return aviso('Ya existe una subcarpeta con ese nombre en esta materia.', true);
          u.nombre = limpio;
          persistir();
          pintarUnidades();
        } else {
          const extra = u.cuestionarios.length ? ' con sus ' + plural(u.cuestionarios.length, 'cuestionario') : '';
          if (!confirm('¿Eliminar la subcarpeta "' + u.nombre + '"' + extra + '? No se puede deshacer.')) return;
          m.subcarpetas = m.subcarpetas.filter(function (x) { return x.id !== u.id; });
          persistir();
          pintarUnidades();
        }
      });
      cont.appendChild(div);
    });
  }

  function crearUnidad(nombreSugerido) {
    const m = materiaPorId(materiaActual);
    if (!m) return aviso('No hay materia seleccionada.', true);

    const input = $('#inputUnidad');
    const nombre = (nombreSugerido !== undefined ? nombreSugerido : input.value).trim();
    if (!nombre) return aviso('Escribe el nombre de la subcarpeta.', true);
    if (nombreDuplicado(m.subcarpetas.map(function (x) { return x.nombre; }), nombre, null))
      return aviso('Ya existe una subcarpeta con ese nombre en esta materia.', true);

    m.subcarpetas.push({ id: Store.id(), nombre: nombre, cuestionarios: [] });
    input.value = '';
    persistir();
    pintarUnidades();
    aviso('Subcarpeta "' + nombre + '" creada.');
  }

  // ---------- CUESTIONARIOS ----------
  function pintarCuestionarios() {
    const u = unidadPorId(materiaActual, unidadActual);
    if (!u) { unidadActual = null; return pintarUnidades(); }
    const m = materiaPorId(materiaActual);

    $('#tituloUnidad').textContent = m.nombre + ' › ' + u.nombre;
    pintarMigas('cuestionarios', m.nombre, u.nombre);

    const cont = $('#listaCuestionarios');
    cont.innerHTML = '';
    if (u.cuestionarios.length === 0) {
      cont.innerHTML = '<p class="meta">Esta subcarpeta no tiene cuestionarios. Crea el primero.</p>';
    }

    u.cuestionarios.forEach(function (q) {
      const div = document.createElement('div');
      div.className = 'tarjeta-cuestionario';
      div.innerHTML =
        '<div class="izq"><strong>' + esc(q.titulo) + '</strong>' +
        '<span class="meta">' + plural(q.preguntas.length, 'pregunta') + '</span></div>' +
        '<div class="acciones">' +
        '<button class="pri" data-acc="resolver">Resolver</button>' +
        '<button class="sec" data-acc="editar">Editar</button>' +
        '<button class="sec" data-acc="eliminar">Eliminar</button>' +
        '</div>';
      div.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-acc]');
        if (!b) return;
        if (b.dataset.acc === 'resolver') { cuestionarioActual = q.id; presentar(); }
        else if (b.dataset.acc === 'editar') { cuestionarioActual = q.id; abrirEditor(); }
        else {
          if (!confirm('¿Eliminar el cuestionario "' + q.titulo + '"?')) return;
          u.cuestionarios = u.cuestionarios.filter(function (x) { return x.id !== q.id; });
          persistir();
          pintarCuestionarios();
        }
      });
      cont.appendChild(div);
    });
    ver('cuestionarios');
  }

  function nuevoCuestionario() {
    if (!unidadPorId(materiaActual, unidadActual)) return aviso('Primero abre una subcarpeta.', true);
    cuestionarioActual = null;
    editando = null;
    $('#tituloEditor').textContent = 'Nuevo cuestionario';
    $('#inputTitulo').value = '';
    $('#inputPreguntas').value = '';
    pintarPrevia();
    ver('editor');
    $('#inputTitulo').focus();
  }

  // ---------- EDITOR ----------
  function abrirEditor() {
    const q = cuestionarioPorId(materiaActual, unidadActual, cuestionarioActual);
    if (!q) return;
    editando = q.id;
    $('#tituloEditor').textContent = 'Editar cuestionario';
    $('#inputTitulo').value = q.titulo;
    $('#inputPreguntas').value = aTexto(q.preguntas);
    pintarPrevia();
    ver('editor');
  }

  function aTexto(preguntas) {
    return preguntas.map(function (p, i) {
      const ops = p.opciones.map(function (o, j) {
        return (o.correcta ? '*' : '') + String.fromCharCode(97 + j) + ') ' + o.texto;
      });
      return (i + 1) + ') ' + p.texto + '\n' + ops.join('\n');
    }).join('\n\n');
  }

  function pintarPrevia() {
    const r = Parser.parse($('#inputPreguntas').value);
    const cont = $('#vistaPrevia');
    cont.innerHTML = '';
    if (r.preguntas.length === 0 && r.errores.length === 0) {
      cont.innerHTML = '<p class="meta">Aquí aparecerá la vista previa de las preguntas.</p>';
    }
    r.preguntas.forEach(function (p) {
      const d = document.createElement('div');
      d.className = 'preg-prev';
      const ops = p.opciones.map(function (o) {
        return '<div class="op-prev ' + (o.correcta ? 'correcta' : 'incorrecta') + '">' +
          (o.correcta ? '&#10003; ' : '&times; ') + esc(o.texto) + '</div>';
      }).join('');
      d.innerHTML = '<div class="tit">' + esc(p.texto) + '</div><div class="ops">' + ops + '</div>';
      cont.appendChild(d);
    });
    if (r.errores.length) {
      const d = document.createElement('div');
      d.className = 'op-prev incorrecta';
      d.innerHTML = '<strong>Problemas encontrados (' + r.errores.length + '):</strong>' +
        r.errores.map(function (e) { return '<div>Línea ' + e.linea + ': ' + esc(e.msg) + '</div>'; }).join('');
      cont.appendChild(d);
    }
    return r;
  }

  function guardarCuestionario() {
    const titulo = $('#inputTitulo').value.trim();
    if (!titulo) return aviso('Ponle un título al cuestionario.', true);
    const r = pintarPrevia();
    if (r.preguntas.length === 0) return aviso('No se detectó ninguna pregunta válida.', true);
    if (r.errores.length && !confirm('Hay ' + r.errores.length + ' problema(s) en el texto. Se guardarán solo las ' +
      plural(r.preguntas.length, 'pregunta') + ' válida(s). ¿Continuar?')) return;

    const u = unidadPorId(materiaActual, unidadActual);
    if (!u) return aviso('No hay subcarpeta seleccionada.', true);

    const obj = {
      titulo: titulo,
      preguntas: r.preguntas.map(function (p) {
        return {
          texto: p.texto,
          opciones: p.opciones.map(function (o) { return { texto: o.texto, correcta: o.correcta }; })
        };
      })
    };

    if (editando) {
      const q = cuestionarioPorId(materiaActual, unidadActual, editando);
      if (q) Object.assign(q, obj);
    } else {
      const nuevo = Object.assign({ id: Store.id() }, obj);
      u.cuestionarios.push(nuevo);
      cuestionarioActual = nuevo.id;
    }
    persistir();
    pintarCuestionarios();
    aviso('Cuestionario guardado.');
  }

  // ---------- PRESENTAR ----------
  function barajar(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  function presentar() {
    const q = cuestionarioPorId(materiaActual, unidadActual, cuestionarioActual);
    if (!q) return;
    if (!q.preguntas.length) return aviso('Este cuestionario no tiene preguntas.', true);
    $('#tituloPresentar').textContent = q.titulo;
    sesion = {
      preguntas: barajar(q.preguntas).map(function (p) {
        const ops = barajar(p.opciones);
        return {
          texto: p.texto,
          opciones: ops,
          correcta: ops.findIndex(function (o) { return o.correcta; })
        };
      }),
      indice: 0,
      respuestas: new Array(q.preguntas.length).fill(null)
    };
    $('#panelResultado').classList.add('oculto');
    $('#areaPresentar').classList.remove('oculto');
    pintarPregunta();
    ver('presentar');
  }

  function pintarPregunta() {
    const s = sesion;
    const p = s.preguntas[s.indice];
    const elegida = s.respuestas[s.indice];
    $('#contadorPregunta').textContent = 'Pregunta ' + (s.indice + 1) + ' de ' + s.preguntas.length;
    $('#barraRelleno').style.width = ((s.indice + 1) / s.preguntas.length * 100) + '%';

    const ops = p.opciones.map(function (o, i) {
      let cls = 'opcion';
      if (elegida !== null) {
        cls += ' desactivada';
        if (i === p.correcta) cls += ' correcta';
        else if (i === elegida) cls += ' incorrecta';
      }
      const marca = elegida !== null ? (i === p.correcta ? '&#10003; ' : (i === elegida ? '&times; ' : '')) : '';
      return '<button class="' + cls + '" data-i="' + i + '">' + marca + esc(o.texto) + '</button>';
    }).join('');

    $('#panelPregunta').innerHTML =
      '<div class="pregunta-texto">' + esc(p.texto) + '</div>' +
      '<div class="opciones">' + ops + '</div>';

    $$('#panelPregunta .opcion').forEach(function (b) {
      b.addEventListener('click', function () { responder(Number(b.dataset.i)); });
    });

    $('#btnAnterior').disabled = s.indice === 0;
    const ultima = s.indice === s.preguntas.length - 1;
    $('#btnSiguiente').classList.toggle('oculto', ultima);
    $('#btnTerminar').classList.toggle('oculto', !ultima);
    $('#btnTerminar').disabled = elegida === null;
  }

  function responder(i) {
    sesion.respuestas[sesion.indice] = i;
    pintarPregunta();
  }

  function siguiente() {
    if (sesion.indice === sesion.preguntas.length - 1) return;
    sesion.indice++;
    pintarPregunta();
  }

  function anterior() {
    if (sesion.indice === 0) return;
    sesion.indice--;
    pintarPregunta();
  }

  function salirPresentar() {
    sesion = null;
    $('#panelResultado').classList.add('oculto');
    $('#areaPresentar').classList.remove('oculto');
    pintarCuestionarios();
  }

  function terminar() {
    const s = sesion;
    const sinResponder = s.respuestas.filter(function (r) { return r === null; }).length;
    if (sinResponder && !confirm('Quedan ' + plural(sinResponder, 'pregunta') + ' sin responder. ¿Ver el resultado?')) return;

    let acertadas = 0;
    const items = s.preguntas.map(function (p, i) {
      const r = s.respuestas[i];
      const ok = r === p.correcta;
      if (ok) acertadas++;
      return { p: p, elegida: r, ok: ok };
    });
    const total = s.preguntas.length;
    const pct = Math.round(acertadas / total * 100);

    $('#areaPresentar').classList.add('oculto');
    const res = $('#panelResultado');
    res.classList.remove('oculto');
    res.innerHTML =
      '<div class="resultado-cab">' +
      '<h2>Resultado</h2>' +
      '<div class="puntaje">' + pct + '%</div>' +
      '<div class="resumen">' + acertadas + ' acertadas &middot; ' + (total - acertadas) +
      ' erradas &middot; ' + total + ' en total</div>' +
      '<div class="fila centro">' +
      '<button class="pri" id="btnReintentar">Intentar de nuevo</button>' +
      '<button class="sec" id="btnVolverLista">Volver a cuestionarios</button>' +
      '</div></div>' +
      '<div class="lista-resultado">' + items.map(function (it, i) {
        const ops = it.p.opciones.map(function (o, j) {
          let cls = 'op-res';
          if (j === it.p.correcta) cls += ' ok correcta';
          else if (j === it.elegida) cls += ' err';
          return '<div class="' + cls + '">' + (j === it.p.correcta ? '&#10003; ' : (j === it.elegida ? '&times; ' : '')) + esc(o.texto) + '</div>';
        }).join('');
        return '<div class="item-res">' +
          '<div class="preg">' + (i + 1) + '. ' + esc(it.p.texto) + ' ' +
          (it.ok ? '<span class="marca ok">&#10003;</span>' : '<span class="marca err">&times;</span>') + '</div>' +
          '<div class="ops-res">' + ops + '</div></div>';
      }).join('') + '</div>';

    $('#btnReintentar').addEventListener('click', presentar);
    $('#btnVolverLista').addEventListener('click', salirPresentar);
  }

  // ---------- IMPORTAR / EXPORTAR ----------
  function exportar() {
    const c = Store.contar(datos);
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cuestionarios-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    aviso('Exportado: ' + plural(c.materias, 'materia') + ', ' +
      plural(c.subcarpetas, 'subcarpeta') + ', ' + plural(c.cuestionarios, 'cuestionario') + '.');
  }

  function importar(archivo) {
    const lector = new FileReader();
    lector.onload = function () {
      let json;
      try {
        json = JSON.parse(lector.result);
      } catch (e) {
        return aviso('El archivo no es un JSON válido.', true);
      }
      const limpio = Store.normalizar(json);
      if (!limpio) return aviso('El archivo no tiene la estructura de cuestionarios.', true);

      const c = Store.contar(limpio);
      if (!confirm('Se importarán ' + plural(c.materias, 'materia') + ', ' +
        plural(c.subcarpetas, 'subcarpeta') + ' y ' + plural(c.cuestionarios, 'cuestionario') +
        ', y se reemplazarán los datos actuales. ¿Continuar?')) return;

      datos = limpio;
      materiaActual = null;
      unidadActual = null;
      cuestionarioActual = null;
      persistir();
      pintarMaterias();
      ver('materias');
      aviso('Importado: ' + plural(c.materias, 'materia') + ', ' +
        plural(c.subcarpetas, 'subcarpeta') + ', ' + plural(c.cuestionarios, 'cuestionario') + '.');
    };
    lector.readAsText(archivo);
  }

  // ---------- ARRANQUE ----------
  $('#btnCrearMateria').addEventListener('click', crearMateria);
  $('#inputMateria').addEventListener('keydown', function (e) { if (e.key === 'Enter') crearMateria(); });
  $('#btnVolverMaterias').addEventListener('click', function () {
    materiaActual = null; unidadActual = null; pintarMaterias(); ver('materias');
  });

  $('#btnCrearUnidad').addEventListener('click', function () { crearUnidad(); });
  $('#inputUnidad').addEventListener('keydown', function (e) { if (e.key === 'Enter') crearUnidad(); });
  $('#btnNuevaUnidadRapida').addEventListener('click', function () {
    const m = materiaPorId(materiaActual);
    if (!m) return;
    crearUnidad('Unidad ' + siguienteNumeroUnidad(m));
  });
  $('#btnVolverUnidades').addEventListener('click', function () {
    unidadActual = null; cuestionarioActual = null; pintarUnidades();
  });

  $('#btnNuevoCuestionario').addEventListener('click', nuevoCuestionario);
  $('#btnVolverCuestionarios').addEventListener('click', function () { pintarCuestionarios(); });
  $('#btnParsear').addEventListener('click', pintarPrevia);
  $('#btnGuardar').addEventListener('click', guardarCuestionario);
  $('#btnCancelarEditor').addEventListener('click', function () { pintarCuestionarios(); });
  $('#inputPreguntas').addEventListener('input', function () {
    clearTimeout(window.__tPrev);
    window.__tPrev = setTimeout(pintarPrevia, 350);
  });
  $('#btnSalirPresentar').addEventListener('click', salirPresentar);
  $('#btnAnterior').addEventListener('click', anterior);
  $('#btnSiguiente').addEventListener('click', siguiente);
  $('#btnTerminar').addEventListener('click', terminar);
  $('#btnExportar').addEventListener('click', exportar);
  $('#btnImportar').addEventListener('click', function () { $('#inputImportar').click(); });
  $('#inputImportar').addEventListener('change', function (e) {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = '';
  });

  pintarMaterias();
  ver('materias');
})();